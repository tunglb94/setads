"""
Celery tasks for syncing Meta Ads data.
Beat schedule: every 15 minutes.
"""
import logging

from celery import shared_task
from django.conf import settings

from .models import AdAccount
from .services import sync_insights_to_db, MetaAPIError

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=120,
    name="meta_ads.sync_all_accounts",
)
def sync_all_accounts(self, days: int = 3):
    """
    Celery Beat task: sync insights for all active ad accounts.
    Runs every 15 minutes via django-celery-beat periodic task.
    """
    accounts = AdAccount.objects.filter(is_active=True)
    total = 0
    errors = []

    for account in accounts:
        try:
            count = sync_insights_to_db(account, days=days)
            total += count
            logger.info("Synced %d rows for account %s", count, account.account_id)
        except MetaAPIError as exc:
            logger.error("Failed to sync account %s: %s", account.account_id, exc)
            errors.append({"account_id": account.account_id, "error": str(exc)})
        except Exception as exc:
            logger.exception("Unexpected error syncing account %s", account.account_id)
            errors.append({"account_id": account.account_id, "error": str(exc)})
            # Retry on unexpected errors
            raise self.retry(exc=exc)

    return {"synced_rows": total, "errors": errors}
