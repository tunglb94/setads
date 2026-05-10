"""
Quick connectivity test — run after venv activated and DB is up.
  python test_connections.py

Tests: Meta API, Local LLM, PostgreSQL, Redis
"""
import os
import sys
import django

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core_project.settings")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from django.conf import settings

GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

def ok(msg):  print(f"  {GREEN}[OK]{RESET} {msg}")
def fail(msg): print(f"  {RED}[FAIL]{RESET} {msg}")
def info(msg): print(f"  {YELLOW}[..]{RESET} {msg}")


# ── 1. PostgreSQL ─────────────────────────────────────────────────────────────
print("\n[1] PostgreSQL")
try:
    from django.db import connection
    with connection.cursor() as c:
        c.execute("SELECT version()")
        ver = c.fetchone()[0]
    ok(f"Connected — {ver[:40]}")
except Exception as e:
    fail(f"Cannot connect: {e}")


# ── 2. Redis ──────────────────────────────────────────────────────────────────
print("\n[2] Redis")
try:
    import redis as redis_lib
    r = redis_lib.from_url(settings.CELERY_BROKER_URL)
    r.ping()
    ok(f"Connected — {settings.CELERY_BROKER_URL}")
except Exception as e:
    fail(f"Cannot connect: {e}")


# ── 3. Meta API ───────────────────────────────────────────────────────────────
print("\n[3] Meta Marketing API")
try:
    from facebook_business.api import FacebookAdsApi
    from facebook_business.adobjects.adaccount import AdAccount

    FacebookAdsApi.init(
        app_id=settings.META_APP_ID,
        app_secret=settings.META_APP_SECRET,
        access_token=settings.META_ACCESS_TOKEN,
    )
    account = AdAccount(settings.META_AD_ACCOUNT_ID)
    data = account.api_get(fields=["name", "currency", "account_status"])

    status_map = {1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW", 9: "IN_GRACE_PERIOD"}
    status = status_map.get(data.get("account_status"), str(data.get("account_status")))

    ok(f"Account: {data.get('name')}")
    ok(f"Currency: {data.get('currency')} | Status: {status}")
    info(f"Account ID: {settings.META_AD_ACCOUNT_ID}")
except Exception as e:
    fail(f"Meta API error: {e}")


# ── 4. Meta — fetch campaigns ─────────────────────────────────────────────────
print("\n[4] Meta — Fetch Campaigns")
try:
    from facebook_business.adobjects.adaccount import AdAccount
    account = AdAccount(settings.META_AD_ACCOUNT_ID)
    campaigns = account.get_campaigns(
        fields=["name", "status", "objective"],
        params={"limit": 5}
    )
    if campaigns:
        ok(f"Found {len(campaigns)} campaigns (showing first 5):")
        for c in campaigns:
            print(f"       • {c['name']} [{c['status']}]")
    else:
        info("No campaigns found in this account")
except Exception as e:
    fail(f"Failed to fetch campaigns: {e}")


# ── 5. Local LLM ──────────────────────────────────────────────────────────────
print("\n[5] Local LLM (gpt-oss:20b via Ollama)")
try:
    from openai import OpenAI
    client = OpenAI(
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
        timeout=30,
    )
    resp = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[{"role": "user", "content": 'Reply with exactly: {"status": "ok"}'}],
        temperature=0,
        max_tokens=20,
    )
    raw = resp.choices[0].message.content.strip()
    ok(f"Model: {settings.LLM_MODEL}")
    ok(f"Response: {raw}")
except Exception as e:
    fail(f"LLM error: {e}")
    info(f"Is Ollama running? Try: ollama serve")


print("\n" + "-" * 50)
