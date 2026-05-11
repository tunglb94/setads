"""
Messenger service layer.

Key design decisions:
- Webhook is primary (real-time). Polling is fallback for missed events.
- Meta only returns last 20 messages per conversation — we archive immediately.
- Phone extraction covers Vietnamese formats: 09x, 03x, +84, 84x
- Ad attribution comes from webhook referral payload (only present on first contact).
"""
import hashlib
import hmac
import logging
import re
import time
from datetime import datetime, timezone, timedelta, date as date_type
from typing import Optional

import requests
from django.conf import settings
from django.db import IntegrityError


def _appsecret_proof(access_token: str) -> str:
    """
    Compute appsecret_proof required by Meta for apps with 'Require App Secret' enabled.
    HMAC-SHA256 of the access_token signed with APP_SECRET.
    Safe to include in all requests — Meta ignores it if not required.
    """
    return hmac.new(
        settings.META_APP_SECRET.encode(),
        access_token.encode(),
        hashlib.sha256,
    ).hexdigest()

from django.db import models as django_models

from .models import FacebookPage, Conversation, Message, LeadScore, PageComment, Appointment

logger = logging.getLogger(__name__)

GRAPH_BASE = f"https://graph.facebook.com/{settings.META_API_VERSION}"

# Vietnamese phone patterns:
# 09x, 08x, 03x, 07x (10 digits), optionally +84 or 84 prefix
VN_PHONE_PATTERN = re.compile(
    r"(?<!\d)"
    r"(?:\+84|84|0)"
    r"(?:3[2-9]|5[6-9]|7[0-9]|8[0-9]|9[0-9])"
    r"\d{7}"
    r"(?!\d)"
)
EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

MAX_RETRIES = 3


class MessengerAPIError(Exception):
    pass


def _graph_get(path: str, token: str, params: dict = None) -> dict:
    """Thin wrapper around Graph API GET with retry and appsecret_proof."""
    url = f"{GRAPH_BASE}/{path}"
    params = {**(params or {}), "access_token": token, "appsecret_proof": _appsecret_proof(token)}

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=15)
            if resp.status_code == 429:
                wait = 60 * (attempt + 1)
                logger.warning("Graph API rate limit, waiting %ds", wait)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            if attempt == MAX_RETRIES - 1:
                raise MessengerAPIError(str(exc)) from exc
            time.sleep(5 * (attempt + 1))

    raise MessengerAPIError("Max retries exceeded")


def extract_phone(text: str) -> str:
    """
    Extract first Vietnamese phone number from text. Normalize to 0xxxxxxxxx format.
    Pre-processes text to strip spaces/dots/dashes so '090 123 4567' and '090.123.4567'
    are both matched — without this, the regex fails before replace() even runs.
    """
    if not text:
        return ""
    # Strip formatting chars BEFORE regex so '090 123 4567' → '0901234567'
    clean = re.sub(r"[\s.\-]", "", text)
    match = VN_PHONE_PATTERN.search(clean)
    if not match:
        return ""
    raw = match.group().replace("+84", "0")
    if raw.startswith("84") and len(raw) == 11:
        raw = "0" + raw[2:]
    return raw


def extract_email(text: str) -> str:
    match = EMAIL_PATTERN.search(text)
    return match.group() if match else ""


def fetch_conversations(page: FacebookPage, limit: int = 50) -> list[dict]:
    """
    Poll all recent conversations from a Facebook Page inbox.
    Returns raw API data list.
    """
    data = _graph_get(
        f"{page.page_id}/conversations",
        page.page_access_token,
        params={
            "platform": "messenger",
            "fields": "id,updated_time,participants",
            "limit": limit,
        },
    )
    return data.get("data", [])


def fetch_messages_for_conversation(conversation_id: str, token: str) -> list[dict]:
    """
    Fetch up to 20 messages for a conversation.
    Meta limitation: only 20 most recent are accessible.
    """
    data = _graph_get(
        conversation_id,
        token,
        params={"fields": "messages{id,created_time,from,message,attachments}"},
    )
    return data.get("messages", {}).get("data", [])


def sync_page_conversations(page: FacebookPage, days_back: int = 7) -> dict:
    """
    Pull recent conversations and upsert into DB.
    This is the polling path — webhook path goes through process_webhook_event().
    Returns summary of processed conversations.
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days_back)
    raw_convos = fetch_conversations(page)
    created_count = 0
    updated_count = 0

    for raw in raw_convos:
        updated_time = datetime.fromisoformat(raw["updated_time"].replace("Z", "+00:00"))
        if updated_time < cutoff:
            continue

        # Get participant who is NOT the page
        participants = raw.get("participants", {}).get("data", [])
        user = next((p for p in participants if p["id"] != page.page_id), None)
        if not user:
            continue

        conv, created = Conversation.objects.get_or_create(
            conversation_id=raw["id"],
            defaults={
                "page": page,
                "psid": user["id"],
                "user_name": user.get("name", ""),
                "last_message_at": updated_time,
                "source": Conversation.Source.POLLING,
            },
        )

        if not created:
            conv.last_message_at = updated_time
            conv.save(update_fields=["last_message_at", "updated_at"])

        # Fetch and archive messages (before 30-day window closes)
        _sync_messages(conv, page.page_access_token)

        if created:
            created_count += 1
        else:
            updated_count += 1

    logger.info(
        "Page %s: %d new conversations, %d updated",
        page.page_id, created_count, updated_count,
    )
    return {"created": created_count, "updated": updated_count}


def _sync_messages(conv: Conversation, token: str) -> None:
    """Archive messages for a conversation and extract lead data."""
    raw_messages = fetch_messages_for_conversation(conv.conversation_id, token)
    all_text = []
    msg_count = 0

    for msg in raw_messages:
        msg_id = msg.get("id")
        if not msg_id:
            continue

        sender_id = msg.get("from", {}).get("id", "")
        direction = Message.Direction.INBOUND if sender_id != conv.page.page_id else Message.Direction.OUTBOUND
        text = msg.get("message", "")
        created_time = datetime.fromisoformat(msg["created_time"].replace("Z", "+00:00"))

        Message.objects.get_or_create(
            message_id=msg_id,
            defaults={
                "conversation": conv,
                "direction": direction,
                "text": text,
                "sent_at": created_time,
            },
        )

        if direction == Message.Direction.INBOUND and text:
            all_text.append(text)

        msg_count += 1

    # Update conversation with first/last timestamps
    if raw_messages:
        first_ts = datetime.fromisoformat(raw_messages[-1]["created_time"].replace("Z", "+00:00"))
        last_ts = datetime.fromisoformat(raw_messages[0]["created_time"].replace("Z", "+00:00"))
        combined_text = " ".join(all_text)

        phone = extract_phone(combined_text)
        email = extract_email(combined_text)

        update_fields = ["message_count", "updated_at"]
        conv.message_count = msg_count

        if phone and not conv.phone_number:
            conv.phone_number = phone
            update_fields.append("phone_number")
        if email and not conv.email:
            conv.email = email
            update_fields.append("email")
        if phone or email:
            conv.is_qualified = True
            update_fields.append("is_qualified")
        if not conv.first_message_at:
            conv.first_message_at = first_ts
            update_fields.append("first_message_at")

        conv.last_message_at = last_ts
        conv.save(update_fields=update_fields)


def sync_pages_from_meta(access_token: str) -> list[dict]:
    """
    Discover all Facebook Pages manageable by the access token via me/accounts.
    Creates/updates FacebookPage records automatically.
    Returns list of {page_id, name, created} dicts.
    """
    data = _graph_get(
        "me/accounts",
        access_token,
        params={"fields": "id,name,access_token,category,fan_count", "limit": 100},
    )
    pages = data.get("data", [])
    result = []
    for p in pages:
        page_obj, created = FacebookPage.objects.update_or_create(
            page_id=p["id"],
            defaults={
                "name": p.get("name", ""),
                "page_access_token": p.get("access_token", ""),
                "is_active": True,
            },
        )
        result.append({"page_id": p["id"], "name": p["name"], "created": created})
        logger.info("%s FacebookPage %s (%s)", "Created" if created else "Updated", p["id"], p["name"])
    return result


def subscribe_page_to_webhook(page: FacebookPage) -> bool:
    """
    Subscribe the page to all relevant webhook events via API.
    Uses pages_manage_metadata permission. Eliminates manual Facebook Developer Portal setup.
    """
    fields = ",".join([
        "messages",
        "message_echoes",
        "messaging_referrals",
        "messaging_postbacks",
        "message_deliveries",
        "message_reads",
        "feed",
        "mention",
    ])
    try:
        resp = requests.post(
            f"{GRAPH_BASE}/{page.page_id}/subscribed_apps",
            params={
                "access_token": page.page_access_token,
                "subscribed_fields": fields,
                "appsecret_proof": _appsecret_proof(page.page_access_token),
            },
            timeout=15,
        )
        data = resp.json()
        success = data.get("success", False)
        if success:
            logger.info("Page %s subscribed to webhook events", page.page_id)
        else:
            logger.warning("Failed to subscribe page %s: %s", page.page_id, data)
        return success
    except requests.RequestException as exc:
        logger.error("Webhook subscription error for page %s: %s", page.page_id, exc)
        return False


def get_page_webhook_subscriptions(page: FacebookPage) -> list[str]:
    """Return list of currently subscribed webhook fields for this page."""
    data = _graph_get(
        f"{page.page_id}/subscribed_apps",
        page.page_access_token,
    )
    items = data.get("data", [])
    if items:
        return items[0].get("subscribed_fields", [])
    return []


def sync_page_comments(page: FacebookPage, days: int = 3) -> int:
    """
    Fetch comments from promoted post IDs linked to this page's ads.
    Uses Ad.promoted_post_id directly (avoids /{page}/feed which requires
    pages_read_engagement permission that is often unavailable).
    Returns count of comments processed.
    """
    from apps.meta_ads.models import Ad

    # Only process ads belonging to this page (match via page_id prefix in post_id)
    ads = Ad.objects.exclude(promoted_post_id="").select_related("adset").only(
        "ad_id", "promoted_post_id", "adset__adset_id"
    )

    # Filter to ads whose promoted_post_id belongs to this page
    # promoted_post_id format: "{page_id}_{post_id}" or just post_id
    page_ads = [
        ad for ad in ads
        if ad.promoted_post_id.startswith(page.page_id + "_") or
           ad.promoted_post_id.startswith(page.page_id)
    ]

    if not page_ads:
        logger.info("No promoted posts found for page %s — skipping", page.page_id)
        return 0

    total = 0
    seen_posts: set[str] = set()

    for ad in page_ads:
        post_id = ad.promoted_post_id
        if post_id in seen_posts:
            continue
        seen_posts.add(post_id)

        try:
            comments_data = _graph_get(
                f"{post_id}/comments",
                page.page_access_token,
                params={"fields": "id,message,from,created_time", "limit": 100},
            )
        except MessengerAPIError as exc:
            logger.warning("Comments fetch failed for post %s: %s", post_id, exc)
            continue

        for c in comments_data.get("data", []):
            comment_id = c.get("id")
            if not comment_id:
                continue
            text = c.get("message", "")
            phone = extract_phone(text)
            commented_at = datetime.fromisoformat(c["created_time"].replace("Z", "+00:00"))

            PageComment.objects.update_or_create(
                comment_id=comment_id,
                defaults={
                    "page": page,
                    "post_id": post_id,
                    "adset_id": ad.adset.adset_id,
                    "ad_id": ad.ad_id,
                    "user_name": c.get("from", {}).get("name", ""),
                    "text": text,
                    "phone_number": phone,
                    "is_qualified": bool(phone),
                    "commented_at": commented_at,
                },
            )
            total += 1

    logger.info("Synced %d comments for page %s (%d posts)", total, page.page_id, len(seen_posts))
    return total


# Must match the specific staff confirmation opener, not casual mentions like
# "gọi lại xác nhận lịch hẹn" in a sales chat.
_APPT_TRIGGER = re.compile(
    r'(?:E|em|mình)\s+xin\s+xác\s+nhận\s+lịch\s+hẹn\s+với\s+(?:anh|chị|em|bạn)',
    re.IGNORECASE,
)
_COMPLETED_TRIGGER = re.compile(
    r'cảm\s+ơn.*đã.*(?:tin\s+tưởng|lựa\s+chọn).*(?:sử\s+dụng|trải\s+nghiệm)\s+dịch\s+vụ',
    re.IGNORECASE | re.DOTALL,
)


def extract_appointment_from_message(text: str) -> Optional[dict]:
    """
    Parse appointment confirmation message sent by staff.
    Returns structured dict or None if pattern not found.

    Expected format:
        E xin xác nhận lịch hẹn với chị
        Quyen Kieu
        Sdt: 0939200699
        Ngày: 12/5/2026, 9h
        TV Dịch vụ: ultherapy prime
    """
    if not _APPT_TRIGGER.search(text):
        return None

    # Patient name: next non-empty line after "lịch hẹn với anh/chị/em ..."
    name = ""
    name_match = re.search(
        r'lịch\s+hẹn\s+với\s+(?:anh|chị|em|bạn)\s*\n([^\n]+)',
        text, re.IGNORECASE,
    )
    if name_match:
        name = name_match.group(1).strip()
    else:
        # Fallback: name on same line as trigger (stop at newline)
        inline = re.search(
            r'lịch\s+hẹn\s+với\s+(?:anh|chị|em|bạn)\s+([^\n]{1,60})',
            text, re.IGNORECASE,
        )
        if inline:
            name = inline.group(1).strip()

    # Phone: "Sdt: 0939200699" or "SĐT: ..."
    phone = ""
    phone_match = re.search(r'[Ss][Đđd][Tt]\s*[:\s]+([0-9][\d\s\-\.]{8,11})', text)
    if phone_match:
        phone = re.sub(r'[\s\-\.]', '', phone_match.group(1))

    # Date + time: "Ngày: 12/5/2026, 9h"
    appointment_date = None
    appointment_time = ""
    date_match = re.search(r'[Nn]gày\s*[:\s]\s*([^\n]+)', text)
    if date_match:
        date_str = date_match.group(1)
        dmy = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', date_str)
        if dmy:
            try:
                appointment_date = date_type(int(dmy.group(3)), int(dmy.group(2)), int(dmy.group(1)))
            except ValueError:
                pass
        t = re.search(r'(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})', date_str, re.IGNORECASE)
        if t:
            appointment_time = t.group(1)

    # Service: "TV Dịch vụ: ..." or "Dịch vụ: ..."
    service = ""
    svc_match = re.search(r'(?:TV\s+)?[Dd]ịch\s+vụ\s*[:\s]\s*([^\n]+)', text)
    if svc_match:
        service = svc_match.group(1).strip()

    # Require at least phone OR date — otherwise it's likely a casual mention
    if not phone and not appointment_date:
        return None

    return {
        "patient_name": name,
        "phone": phone,
        "appointment_date": appointment_date,
        "appointment_time": appointment_time,
        "service": service,
    }


def process_webhook_event(event: dict, page: FacebookPage) -> Optional[Conversation]:
    """
    Process a single messaging event from Facebook webhook.
    This is the real-time path. Extracts referral (ad attribution) from first contact.
    """
    messaging = event.get("messaging", [{}])[0]
    msg_data = messaging.get("message", {})
    is_echo = msg_data.get("is_echo", False)

    # ── Echo (outbound) message — sent by staff from Meta Inbox ──────────────
    if is_echo:
        text = msg_data.get("text", "")
        msg_id = msg_data.get("mid", "")
        timestamp = messaging.get("timestamp", 0)
        sent_at = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
        # recipient is the customer (sender is the page in echo events)
        recipient_id = messaging.get("recipient", {}).get("id")
        if not recipient_id or not text or not msg_id:
            return None

        conv = Conversation.objects.filter(psid=recipient_id, page=page).first()
        if conv:
            Message.objects.get_or_create(
                message_id=msg_id,
                defaults={
                    "conversation": conv,
                    "direction": Message.Direction.OUTBOUND,
                    "text": text,
                    "sent_at": sent_at,
                },
            )
            _detect_and_save_appointment(text, conv, page)
        return conv

    sender_id = messaging.get("sender", {}).get("id")
    # Drop if sender is the page itself (postback / delivery receipts without echo flag)
    if not sender_id or sender_id == page.page_id:
        return None

    # Ad attribution is only present on the FIRST message (postback or referral)
    referral = messaging.get("referral") or messaging.get("postback", {}).get("referral", {})
    ad_id = referral.get("ad_id", "")
    adset_id = referral.get("adset_id", "")
    campaign_id = referral.get("campaign_id", "")

    # get_or_create with IntegrityError guard against race condition:
    # Facebook can fire 2 webhooks within milliseconds (user double-taps send).
    # Both workers see "not found" simultaneously, both try INSERT → one gets IntegrityError.
    try:
        conv, created = Conversation.objects.get_or_create(
            psid=sender_id,
            page=page,
            defaults={
                "conversation_id": f"temp_{sender_id}_{page.page_id}",
                "user_name": "",
                "referral_ad_id": ad_id,
                "referral_adset_id": adset_id,
                "referral_campaign_id": campaign_id,
                "source": Conversation.Source.WEBHOOK,
            },
        )
    except IntegrityError:
        conv = Conversation.objects.get(psid=sender_id, page=page)

    # Process the inbound message
    text = msg_data.get("text", "")
    msg_id = msg_data.get("mid", "")
    timestamp = messaging.get("timestamp", 0)
    sent_at = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)

    if msg_id:
        Message.objects.get_or_create(
            message_id=msg_id,
            defaults={
                "conversation": conv,
                "direction": Message.Direction.INBOUND,
                "text": text,
                "sent_at": sent_at,
            },
        )

    # Extract phone from this message
    if text:
        phone = extract_phone(text)
        email = extract_email(text)
        changed = False

        if phone and not conv.phone_number:
            conv.phone_number = phone
            conv.is_qualified = True
            changed = True
        if email and not conv.email:
            conv.email = email
            conv.is_qualified = True
            changed = True
        if changed:
            conv.save(update_fields=["phone_number", "email", "is_qualified", "updated_at"])

    conv.last_message_at = sent_at
    conv.message_count = conv.messages.count()
    conv.save(update_fields=["last_message_at", "message_count", "updated_at"])

    logger.info(
        "Webhook: conversation %s from ad %s, phone=%s",
        conv.conversation_id, adset_id, bool(conv.phone_number),
    )
    return conv


def _detect_and_save_appointment(text: str, conv: Conversation, page: FacebookPage) -> None:
    """
    Run appointment detector on an outbound message. Two patterns trigger an Appointment:
    1. Appointment confirmation → status=SCHEDULED
    2. Post-service thank-you  → status=COMPLETED (they already showed up)
    """
    # Pattern 1: appointment confirmation
    appt_data = extract_appointment_from_message(text)
    if appt_data:
        Appointment.objects.get_or_create(
            conversation=conv,
            appointment_date=appt_data["appointment_date"],
            defaults={
                "page": page,
                "adset_id": conv.referral_adset_id,
                "patient_name": appt_data["patient_name"],
                "phone": appt_data["phone"] or conv.phone_number,
                "appointment_time": appt_data["appointment_time"],
                "service": appt_data["service"],
                "raw_message": text,
                "status": Appointment.Status.SCHEDULED,
            },
        )
        logger.info(
            "Appointment detected: %s | %s | %s",
            appt_data["patient_name"], appt_data["appointment_date"], appt_data["service"][:40],
        )
        return

    # Pattern 2: post-service thank-you → customer already completed the appointment
    if _COMPLETED_TRIGGER.search(text):
        # If an existing SCHEDULED appointment exists for this conversation, mark it completed.
        # Otherwise create a COMPLETED record (they came without a prior confirmation in our system).
        existing = Appointment.objects.filter(conversation=conv).order_by("-detected_at").first()
        if existing and existing.status == Appointment.Status.SCHEDULED:
            existing.status = Appointment.Status.COMPLETED
            existing.save(update_fields=["status"])
            logger.info("Appointment %s marked COMPLETED via thank-you message", existing.id)
        elif not existing:
            Appointment.objects.create(
                conversation=conv,
                page=page,
                adset_id=conv.referral_adset_id,
                patient_name=conv.user_name,
                phone=conv.phone_number,
                raw_message=text,
                status=Appointment.Status.COMPLETED,
            )
            logger.info("New COMPLETED appointment created from thank-you message for conv %s", conv.id)


def gather_deep_funnel_metrics(ad_id: str, date_from: str | None = None, date_to: str | None = None) -> dict:
    """
    True CPL: combine Meta API spend + conversation count with AI-scored quality data.

    Data sources:
    - Meta AdInsight: accurate per-ad spend, impressions, AND conversation count
      (conversions field = comments + messages from Meta's action tracking)
    - Internal DB: quality signals (phone rate, spam, appointment)
      Priority: attributed conversations (referral_ad_id) > global rate estimation
    """
    from datetime import date, timedelta
    from apps.meta_ads.models import AdInsight

    if date_from and date_to:
        insight_filter = {"date__gte": date.fromisoformat(date_from), "date__lte": date.fromisoformat(date_to)}
        conv_date_filter = {"first_message_at__date__gte": date_from, "first_message_at__date__lte": date_to}
    else:
        seven_days_ago = date.today() - timedelta(days=7)
        insight_filter = {"date__gte": seven_days_ago}
        conv_date_filter = {}

    spend_agg = AdInsight.objects.filter(
        entity_id=ad_id,
        level=AdInsight.Level.AD,
        **insight_filter,
    ).aggregate(
        total_spend=django_models.Sum("spend"),
        total_impressions=django_models.Sum("impressions"),
        total_clicks=django_models.Sum("clicks"),
        total_message_count=django_models.Sum("message_count"),
        total_comment_count=django_models.Sum("comment_count"),
        total_conversions=django_models.Sum("conversions"),
    )

    total_spend = float(spend_agg.get("total_spend") or 0)
    total_impressions = int(spend_agg.get("total_impressions") or 0)
    total_clicks = int(spend_agg.get("total_clicks") or 0)
    
    # Extract total_inbox from meta_messages, not meta_convs
    meta_messages = int(spend_agg.get("total_message_count") or 0)
    meta_comments = int(spend_agg.get("total_comment_count") or 0)
    total_conversions_fallback = int(spend_agg.get("total_conversions") or 0)

    # 🔴 LOGIC FALLBACK CỨU DỮ LIỆU CŨ:
    # Nếu DB chưa có dữ liệu inbox/comment tách rời nhưng có tổng số conversions, 
    # thì tạm lấy số conversions đó đẩy vào inbox để không bị mất dữ liệu trên UI.
    if meta_messages == 0 and meta_comments == 0 and total_conversions_fallback > 0:
        meta_messages = total_conversions_fallback

    # ── Quality signals ──────────────────────────────────────────────────────────
    # Webhook-attributed conversations = real inbox messages sent via Messenger
    attributed = Conversation.objects.filter(referral_ad_id=ad_id, **conv_date_filter)
    has_attribution = attributed.exists()

    if has_attribution:
        total_inbox = attributed.count()
        total_convs = total_inbox
        qualified_convs = attributed.filter(is_qualified=True).count()
        scores = LeadScore.objects.filter(conversation__referral_ad_id=ad_id, **{"conversation__" + k: v for k, v in conv_date_filter.items()})
        scored_count = scores.count()
        hot_count = scores.filter(intent_level="HOT").count()
        warm_count = scores.filter(intent_level="WARM").count()
        spam_count = scores.filter(is_spam=True).count()
        appointment_count = scores.filter(has_appointment=True).count()
    else:
        # No webhook attribution — use Meta's count for funnel sizing,
        # apply quality rates from active-page inbox as estimates.
        total_inbox = meta_messages
        total_convs = meta_messages
        active_convs_qs = Conversation.objects.filter(page__is_active=True)
        all_convs_count = active_convs_qs.count()
        all_qualified = active_convs_qs.filter(is_qualified=True).count()
        all_scores = LeadScore.objects.filter(conversation__page__is_active=True)
        all_scored = all_scores.count()

        if all_convs_count > 0 and total_convs > 0:
            q_rate = all_qualified / all_convs_count
            qualified_convs = round(total_convs * q_rate)
        else:
            qualified_convs = 0

        if all_scored > 0 and total_convs > 0:
            spam_rate_g = all_scores.filter(is_spam=True).count() / all_scored
            appt_rate_g = all_scores.filter(has_appointment=True).count() / all_scored
            hot_rate_g = all_scores.filter(intent_level="HOT").count() / all_scored
            warm_rate_g = all_scores.filter(intent_level="WARM").count() / all_scored
            scored_count = total_convs
            spam_count = round(total_convs * spam_rate_g)
            appointment_count = round(total_convs * appt_rate_g)
            hot_count = round(total_convs * hot_rate_g)
            warm_count = round(total_convs * warm_rate_g)
        else:
            scored_count = spam_count = appointment_count = hot_count = warm_count = 0

    # Calculate CPL using ONLY inbox messages, disregarding comments completely
    cost_per_message = round(total_spend / total_inbox) if total_inbox > 0 else 0
    cost_per_qualified_lead = round(total_spend / qualified_convs) if qualified_convs > 0 else 0
    cost_per_hot_lead = round(total_spend / hot_count) if hot_count > 0 else 0
    spam_rate = round(spam_count / scored_count * 100, 1) if scored_count > 0 else 0.0

    return {
        "ad_id": ad_id,
        "total_spend": total_spend,
        "total_impressions": total_impressions,
        "total_clicks": total_clicks,
        "total_inbox": total_inbox,
        "total_comments": meta_comments,
        "total_conversations": total_convs,
        "meta_message_count": meta_messages,
        "meta_comment_count": meta_comments,
        "qualified_leads": qualified_convs,
        "hot_leads": hot_count,
        "warm_leads": warm_count,
        "spam_count": spam_count,
        "appointment_count": appointment_count,
        "scored_count": scored_count,
        "cost_per_message": cost_per_message,
        "cost_per_qualified_lead": cost_per_qualified_lead,
        "cost_per_hot_lead": cost_per_hot_lead,
        "qualified_rate": round(qualified_convs / total_convs * 100, 1) if total_convs > 0 else 0.0,
        "spam_rate": spam_rate,
    }