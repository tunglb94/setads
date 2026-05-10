"""Seed AdAccount và chạy sync đầu tiên từ Meta API."""
import os, sys, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core_project.settings")
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from django.conf import settings
from apps.meta_ads.models import AdAccount
from apps.meta_ads.services import sync_insights_to_db

# 1. Seed AdAccount
acc, created = AdAccount.objects.get_or_create(
    account_id=settings.META_AD_ACCOUNT_ID,
    defaults={
        "name": "V Medical 07",
        "access_token": settings.META_ACCESS_TOKEN,
        "currency": "VND",
        "timezone_name": "Asia/Ho_Chi_Minh",
        "is_active": True,
    }
)
print(f"[{'CREATED' if created else 'EXISTS'}] AdAccount: {acc}")

# 2. First sync — pull 3 days of insights
print("\nSyncing insights from Meta API (last 3 days)...")
try:
    count = sync_insights_to_db(acc, days=3)
    print(f"[OK] Synced {count} insight rows into DB")
except Exception as e:
    print(f"[FAIL] Sync error: {e}")
    sys.exit(1)

# 3. Show what we got
from apps.meta_ads.models import AdInsight, AdSet
print(f"\nAdSets in DB : {AdSet.objects.count()}")
print(f"Insight rows : {AdInsight.objects.count()}")

print("\nTop 5 AdSets by spend (last 3 days):")
from django.db.models import Sum
top = (
    AdInsight.objects
    .filter(level="adset")
    .values("entity_id", "entity_name")
    .annotate(total_spend=Sum("spend"))
    .order_by("-total_spend")[:5]
)
for row in top:
    print(f"  • {row['entity_name'][:50]:<50} {float(row['total_spend']):>12,.0f} VND")
