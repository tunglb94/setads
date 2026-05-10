"""
Celery tasks for Messenger lead sync + AI lead scoring.
"""
import logging

from celery import shared_task

from .models import FacebookPage, Conversation
from .services import sync_page_conversations, sync_page_comments, MessengerAPIError

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    name="messenger.sync_all_pages",
)
def sync_all_pages(self, days_back: int = 7):
    """Sync conversations from all active pages. Runs every 30 min via Beat."""
    pages = FacebookPage.objects.filter(is_active=True)
    total_new = 0

    for page in pages:
        try:
            result = sync_page_conversations(page, days_back=days_back)
            total_new += result["created"]
        except MessengerAPIError as exc:
            logger.error("Failed to sync page %s: %s", page.page_id, exc)
        except Exception as exc:
            logger.exception("Unexpected error syncing page %s", page.page_id)
            raise self.retry(exc=exc)

    return {"total_new_conversations": total_new}


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    name="messenger.sync_all_comments",
)
def sync_all_comments(self, days: int = 3):
    """
    Sync page post comments for all active pages.
    Extracts phone numbers and links comments to adsets via promoted_post_id.
    """
    from apps.meta_ads.models import AdAccount
    from apps.meta_ads.services import sync_ad_post_mappings

    # Refresh post→adset mappings first
    for account in AdAccount.objects.filter(is_active=True):
        try:
            sync_ad_post_mappings(account)
        except Exception as exc:
            logger.warning("Post mapping failed for %s: %s", account.account_id, exc)

    pages = FacebookPage.objects.filter(is_active=True)
    total = 0
    for page in pages:
        try:
            count = sync_page_comments(page, days=days)
            total += count
            logger.info("Synced %d comments for page %s", count, page.page_id)
        except MessengerAPIError as exc:
            logger.error("Comment sync failed for page %s: %s", page.page_id, exc)
        except Exception as exc:
            logger.exception("Unexpected error syncing comments for page %s", page.page_id)

    return {"total_comments": total}


@shared_task(name="messenger.score_lead")
def score_lead(conversation_id: int) -> dict:
    """
    AI reads full conversation thread (both directions) and classifies lead quality.
    Detects: phone left, appointment booked, spam signals.
    Triggers on 1+ inbound message — no is_qualified requirement.
    """
    from apps.ai_analyzer.services import _get_client, _extract_json, LLMError
    from apps.ai_analyzer.prompts import LEAD_SCORING
    from django.conf import settings

    try:
        conv = Conversation.objects.select_related("page").prefetch_related("messages").get(id=conversation_id)
    except Conversation.DoesNotExist:
        return {"error": "Conversation not found"}

    messages = list(conv.messages.order_by("sent_at"))
    if not messages:
        return {"error": "No messages"}

    # Build full thread with direction labels so AI sees both sides
    thread_lines = []
    for m in messages:
        if m.text:
            label = "Khách" if m.direction == "IN" else "Tư vấn viên"
            thread_lines.append(f"[{label}]: {m.text}")
    if not thread_lines:
        return {"error": "No text content"}

    prompt = LEAD_SCORING.format(
        messages="\n".join(thread_lines),
        has_phone="Có" if conv.phone_number else "Không",
        message_count=conv.message_count,
        adset_name=conv.referral_adset_id or "Không rõ",
    )

    try:
        client = _get_client()
        resp = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": "Bạn là chuyên gia phân tích lead cho digital marketing Việt Nam. Chỉ trả về JSON hợp lệ."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=512,
        )
        result = _extract_json(resp.choices[0].message.content)
    except LLMError as exc:
        return {"error": str(exc)}

    from .models import LeadScore
    LeadScore.objects.update_or_create(
        conversation=conv,
        defaults={
            "score": int(result.get("score", 0)),
            "intent_level": result.get("intent_level", "COLD"),
            "ai_summary": result.get("ai_summary", ""),
            "has_phone": bool(conv.phone_number),
            "has_appointment": bool(result.get("has_appointment")),
            "is_spam": bool(result.get("is_spam")),
            "has_budget_signal": bool(result.get("has_budget_signal")),
            "has_urgency_signal": bool(result.get("has_urgency_signal")),
        },
    )

    return result
