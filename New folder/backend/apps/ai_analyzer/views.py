import json
import logging

from django.http import StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.automations.tasks import trigger_ai_analysis

logger = logging.getLogger(__name__)


# ── Existing endpoints ────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def analyze_adset_now(request, adset_id: str):
    task = trigger_ai_analysis.delay(adset_id)
    return Response({"task_id": task.id, "adset_id": adset_id}, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_task_result(request, task_id: str):
    from celery.result import AsyncResult
    result = AsyncResult(task_id)
    if result.state == "PENDING":
        return Response({"state": "PENDING"})
    if result.state == "SUCCESS":
        return Response({"state": "SUCCESS", "result": result.result})
    if result.state == "FAILURE":
        return Response({"state": "FAILURE", "error": str(result.result)}, status=500)
    return Response({"state": result.state})


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _sse(event_type: str, content: str = "") -> str:
    payload = json.dumps({"type": event_type, "content": content}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _sse_done() -> str:
    return f"data: {json.dumps({'type': 'done'})}\n\n"


def _sse_error(msg: str) -> str:
    return f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"


def _get_user(request):
    """Manual token auth — needed because @api_view blocks StreamingHttpResponse."""
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Token "):
        return None
    try:
        return Token.objects.select_related("user").get(key=auth[6:]).user
    except Token.DoesNotExist:
        return None


# ── Stream parser ─────────────────────────────────────────────────────────────

def _parse_chunk(delta, in_think: bool, buf: str):
    """
    Handle gpt-oss / Ollama mixed output:
    - delta.reasoning_content  → OpenAI o1 style (separate field)
    - <think>...</think> in delta.content → DeepSeek/Qwen style
    Returns (events: list[tuple[str,str]], in_think: bool, buf: str)
    """
    events = []

    # OpenAI o1 / gpt-oss style: reasoning in dedicated field
    rc = getattr(delta, "reasoning_content", None)
    if rc:
        return [("reasoning", rc)], in_think, buf

    text = delta.content or ""
    if not text:
        return [], in_think, buf

    # DeepSeek/Qwen style: <think> tags mixed into content
    buf += text
    while buf:
        if in_think:
            end = buf.find("</think>")
            if end == -1:
                # Whole remaining buffer is reasoning — flush it
                events.append(("reasoning", buf))
                buf = ""
            else:
                if end > 0:
                    events.append(("reasoning", buf[:end]))
                buf = buf[end + 8:]   # skip </think>
                in_think = False
        else:
            start = buf.find("<think>")
            if start == -1:
                # Whole remaining buffer is final content — flush it
                events.append(("content", buf))
                buf = ""
            else:
                if start > 0:
                    events.append(("content", buf[:start]))
                buf = buf[start + 7:]  # skip <think>
                in_think = True

    return events, in_think, buf


# ── Generator ─────────────────────────────────────────────────────────────────

def _stream_generator(ad_id: str):
    from django.conf import settings
    from openai import OpenAI, APIConnectionError, APITimeoutError
    from apps.meta_ads.models import Ad
    from apps.messenger.services import gather_deep_funnel_metrics
    from apps.ai_analyzer.prompts import STREAM_SYSTEM, STREAM_USER

    # ── Build context ──
    try:
        ad = Ad.objects.select_related("adset").get(ad_id=ad_id)
    except Ad.DoesNotExist:
        yield _sse_error(f"Ad {ad_id} không tồn tại.")
        return

    try:
        m = gather_deep_funnel_metrics(ad_id)
    except Exception as exc:
        yield _sse_error(f"Không lấy được metrics: {exc}")
        return

    # CPM estimate
    cpm = round(m["total_spend"] / m["total_impressions"] * 1000) if m["total_impressions"] > 0 else 0

    user_prompt = STREAM_USER.format(
        ad_name=ad.name,
        ad_id=ad.ad_id,
        adset_name=ad.adset.name,
        cpm=cpm,
        prev_decision=ad.ai_decision or "Chưa có",
        prev_reasoning=ad.ai_reasoning or "—",
        **m,
    )

    # ── Stream ──
    client = OpenAI(
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
        timeout=settings.LLM_TIMEOUT,
    )

    try:
        stream = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": STREAM_SYSTEM},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=4096,
            stream=True,
        )
    except (APIConnectionError, APITimeoutError) as exc:
        yield _sse_error(f"Không kết nối được LLM: {exc}")
        return
    except Exception as exc:
        yield _sse_error(f"LLM error: {exc}")
        return

    in_think = False
    buf = ""

    try:
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            events, in_think, buf = _parse_chunk(delta, in_think, buf)
            for etype, econtent in events:
                if econtent:
                    yield _sse(etype, econtent)

        # Flush any remaining buffer as content
        if buf.strip():
            yield _sse("content", buf)

    except Exception as exc:
        logger.exception("Stream error for ad %s", ad_id)
        yield _sse_error(str(exc))

    yield _sse_done()


# ── View ──────────────────────────────────────────────────────────────────────

@csrf_exempt
def stream_ad_analysis(request):
    """
    GET /api/ai_analyzer/stream/?ad_id=<id>
    Server-Sent Events — streams chain-of-thought + final analysis.
    Auth via Authorization: Token <key> header.
    """
    if request.method != "GET":
        return StreamingHttpResponse(status=405)

    user = _get_user(request)
    if not user or not user.is_active:
        return StreamingHttpResponse(
            iter([_sse_error("Unauthorized")]),
            content_type="text/event-stream",
            status=401,
        )

    ad_id = request.GET.get("ad_id", "").strip()
    if not ad_id:
        return StreamingHttpResponse(
            iter([_sse_error("ad_id là bắt buộc.")]),
            content_type="text/event-stream",
            status=400,
        )

    response = StreamingHttpResponse(
        _stream_generator(ad_id),
        content_type="text/event-stream; charset=utf-8",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"   # disable nginx buffering
    response["Access-Control-Allow-Origin"] = "http://localhost:3002"
    response["Access-Control-Allow-Headers"] = "Authorization"
    return response
