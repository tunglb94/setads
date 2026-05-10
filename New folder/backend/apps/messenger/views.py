"""
Messenger webhook handler + REST API for lead management.
"""
import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import FacebookPage, Conversation, PageComment, LeadScore
from .serializers import ConversationSerializer, PageCommentSerializer
from .services import (
    process_webhook_event,
    sync_pages_from_meta,
    subscribe_page_to_webhook,
    get_page_webhook_subscriptions,
    sync_page_comments,
    gather_deep_funnel_metrics,
)
from .tasks import score_lead

logger = logging.getLogger(__name__)


def _verify_signature(request) -> bool:
    """Verify X-Hub-Signature-256 from Meta to reject forged webhooks."""
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        settings.META_APP_SECRET.encode(),
        request.body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature[7:], expected)


@method_decorator(csrf_exempt, name="dispatch")
class MessengerWebhookView(View):
    """
    GET  — webhook verification (Meta calls this when you register the webhook URL)
    POST — receive real-time messaging events
    """

    def get(self, request):
        mode = request.GET.get("hub.mode")
        token = request.GET.get("hub.verify_token")
        challenge = request.GET.get("hub.challenge")

        if mode == "subscribe" and token == settings.WEBHOOK_VERIFY_TOKEN:
            logger.info("Webhook verified successfully")
            return HttpResponse(challenge, content_type="text/plain")

        return HttpResponse("Forbidden", status=403)

    def post(self, request):
        if not _verify_signature(request):
            logger.warning("Invalid webhook signature from %s", request.META.get("REMOTE_ADDR"))
            return HttpResponse("Invalid signature", status=403)

        try:
            payload = json.loads(request.body)
        except json.JSONDecodeError:
            return HttpResponse("Bad JSON", status=400)

        if payload.get("object") != "page":
            return HttpResponse("OK")

        for entry in payload.get("entry", []):
            page_id = entry.get("id")
            try:
                page = FacebookPage.objects.get(page_id=page_id, is_active=True)
            except FacebookPage.DoesNotExist:
                logger.warning("Received webhook for unknown page %s", page_id)
                continue

            for event in entry.get("messaging", []):
                try:
                    conv = process_webhook_event({"messaging": [event]}, page)
                    # Score after first message — AI detects spam vs lead from full thread
                    if conv and conv.message_count >= 1:
                        score_lead.delay(conv.id)
                except Exception:
                    logger.exception("Error processing webhook event for page %s", page_id)

        # Must return 200 quickly — Meta retries for up to 24h if we don't
        return HttpResponse("EVENT_RECEIVED")


class ConversationListView(generics.ListAPIView):
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = (Conversation.objects
              .filter(page__is_active=True)
              .select_related("page", "lead_score")
              .order_by("-last_message_at"))

        if adset_id := self.request.query_params.get("adset_id"):
            qs = qs.filter(referral_adset_id=adset_id)
        if qualified := self.request.query_params.get("qualified"):
            qs = qs.filter(is_qualified=qualified.lower() == "true")
        if intent := self.request.query_params.get("intent"):
            qs = qs.filter(lead_score__intent_level=intent.upper())

        return qs


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def setup_pages(request):
    """
    Auto-discover all Facebook Pages and subscribe them to webhook events.
    Uses pages_show_list + pages_manage_metadata permissions.
    No manual Facebook Developer Portal configuration needed.
    """
    from django.conf import settings
    access_token = settings.META_ACCESS_TOKEN

    # Step 1: Discover pages
    try:
        pages_result = sync_pages_from_meta(access_token)
    except Exception as exc:
        return Response({"error": f"Failed to discover pages: {exc}"}, status=502)

    # Step 2: Subscribe each page to webhook
    subscription_results = []
    for p in pages_result:
        try:
            page_obj = FacebookPage.objects.get(page_id=p["page_id"])
            subscribed_fields = get_page_webhook_subscriptions(page_obj)
            already_subscribed = bool(subscribed_fields)
            if not already_subscribed:
                success = subscribe_page_to_webhook(page_obj)
            else:
                success = True
            subscription_results.append({
                "page_id": p["page_id"],
                "name": p["name"],
                "page_created": p["created"],
                "webhook_subscribed": success,
                "subscribed_fields": subscribed_fields if already_subscribed else ["messages", "feed", "..."],
            })
        except Exception as exc:
            subscription_results.append({"page_id": p["page_id"], "error": str(exc)})

    return Response({
        "pages_found": len(pages_result),
        "results": subscription_results,
        "webhook_url": f"{request.scheme}://{request.get_host()}/api/webhook/messenger/",
        "verify_token": settings.WEBHOOK_VERIFY_TOKEN,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_comments(request):
    """Dispatch background Celery task to sync page post comments."""
    from .tasks import sync_all_comments

    if not FacebookPage.objects.filter(is_active=True).exists():
        return Response({"error": "Không có Page nào. Chạy /api/messenger/setup/ trước."}, status=400)

    days = int(request.data.get("days", 3))
    task = sync_all_comments.delay(days=days)
    return Response({
        "task_id": task.id,
        "status": "queued",
        "pages": FacebookPage.objects.filter(is_active=True).count(),
        "message": f"Đang sync comments {days} ngày cho tất cả pages. Kiểm tra /api/leads/comments/ sau vài phút.",
    })


class PageCommentListView(generics.ListAPIView):
    serializer_class = PageCommentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PageComment.objects.filter(page__is_active=True).select_related("page").order_by("-commented_at")
        if adset_id := self.request.query_params.get("adset_id"):
            qs = qs.filter(adset_id=adset_id)
        if self.request.query_params.get("qualified") == "true":
            qs = qs.filter(is_qualified=True)
        return qs


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def lead_stats_by_adset(request):
    """
    Aggregate lead stats grouped by active Facebook Page.
    Since most conversations come from polling (no referral_adset_id),
    we group by page instead of adset to keep stats meaningful.
    """
    from django.db.models import Count, Q

    # All conversations from active pages, grouped by page
    page_stats = list(
        Conversation.objects
        .filter(page__is_active=True)
        .values("page__page_id", "page__name")
        .annotate(
            inbox_total=Count("id"),
            inbox_qualified=Count("id", filter=Q(is_qualified=True)),
            hot_leads=Count("id", filter=Q(lead_score__intent_level="HOT")),
            warm_leads=Count("id", filter=Q(lead_score__intent_level="WARM")),
        )
    )

    # Comments from active pages, grouped by page
    comment_stats = {
        s["page__page_id"]: s["comment_total"]
        for s in PageComment.objects
        .filter(page__is_active=True)
        .values("page__page_id")
        .annotate(comment_total=Count("id"))
    }

    result = []
    for s in page_stats:
        page_id = s["page__page_id"]
        inbox_total = s["inbox_total"]
        comment_total = comment_stats.get(page_id, 0)
        total = inbox_total + comment_total
        qualified = s["inbox_qualified"]
        result.append({
            "adset_id": page_id,           # reuse field as page_id for frontend compat
            "adset_name": s["page__name"] or page_id,
            "inbox_leads": inbox_total,
            "comment_leads": comment_total,
            "total_leads": total,
            "qualified_leads": qualified,
            "hot_leads": s["hot_leads"],
            "warm_leads": s["warm_leads"],
            "lead_rate": round(qualified / inbox_total * 100, 1) if inbox_total else 0,
        })

    result.sort(key=lambda x: x["total_leads"], reverse=True)
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def deep_funnel_by_ad(request):
    """
    Deep funnel metrics per ad: Meta spend + AI-classified conversation quality.
    Returns True CPL (cost per phone lead) — the North Star metric.
    Query params: adset_id (optional filter)
    """
    from apps.meta_ads.models import Ad

    qs = Ad.objects.filter(status=Ad.Status.ACTIVE).select_related("adset")
    if adset_id := request.query_params.get("adset_id"):
        qs = qs.filter(adset__adset_id=adset_id)

    result = []
    for ad in qs:
        try:
            metrics = gather_deep_funnel_metrics(ad.ad_id)
            result.append({
                **metrics,
                "ad_name": ad.name,
                "adset_id": ad.adset.adset_id,
                "adset_name": ad.adset.name,
                "ai_decision": ad.ai_decision,
                "ai_reasoning": ad.ai_reasoning,
                "ai_confidence": ad.ai_confidence,
                "ai_analyzed_at": ad.ai_analyzed_at,
            })
        except Exception as exc:
            logger.warning("Failed to gather deep funnel for ad %s: %s", ad.ad_id, exc)

    result.sort(key=lambda x: x["total_conversations"], reverse=True)
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def score_all_unscored(request):
    """Manually trigger AI scoring for all unscored conversations. Returns count queued."""
    from .tasks import score_lead

    unscored_ids = list(
        Conversation.objects.filter(page__is_active=True, lead_score__isnull=True, message_count__gte=1)
        .values_list("id", flat=True)[:200]
    )
    for conv_id in unscored_ids:
        score_lead.delay(conv_id)
    return Response({"queued": len(unscored_ids), "message": f"Đang phân loại {len(unscored_ids)} cuộc hội thoại chưa được AI đánh giá."})
