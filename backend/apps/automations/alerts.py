"""Notification services — Telegram (primary), extensible to Zalo/Slack."""
import logging

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(name="automations.send_telegram_alert")
def send_telegram_alert(message: str) -> bool:
    """Send a Markdown message to the configured Telegram chat."""
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_CHAT_ID

    if not token or not chat_id:
        logger.debug("Telegram not configured, skipping alert")
        return False

    import requests
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }

    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        logger.error("Telegram alert failed: %s", exc)
        return False
