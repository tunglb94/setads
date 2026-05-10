import environ
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="django-insecure-change-me-in-production")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["*"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "django_celery_beat",
    "django_celery_results",
    # Local apps
    "apps.users",
    "apps.meta_ads",
    "apps.ai_analyzer",
    "apps.automations",
    "apps.messenger",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core_project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core_project.wsgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://superadmin:superadmin_pass@localhost:5432/superadmin_db")
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "users.User"

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

# --- CORS ---
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://localhost:3002"],
)
CORS_ALLOW_CREDENTIALS = True

# --- Celery ---
CELERY_BROKER_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = "django-db"
CELERY_CACHE_BACKEND = "django-cache"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Asia/Ho_Chi_Minh"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# --- Meta API ---
META_APP_ID = env("META_APP_ID", default="")
META_APP_SECRET = env("META_APP_SECRET", default="")
META_ACCESS_TOKEN = env("META_ACCESS_TOKEN", default="")
META_AD_ACCOUNT_ID = env("META_AD_ACCOUNT_ID", default="")
META_API_VERSION = env("META_API_VERSION", default="v20.0")

# --- Local LLM ---
LLM_BASE_URL = env("LLM_BASE_URL", default="http://localhost:11434/v1")
LLM_MODEL = env("LLM_MODEL", default="deepseek-r1:7b")
LLM_API_KEY = env("LLM_API_KEY", default="ollama")
LLM_TIMEOUT = 120

# --- Telegram ---
TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", default="")
TELEGRAM_CHAT_ID = env("TELEGRAM_CHAT_ID", default="")

# --- Webhook ---
WEBHOOK_VERIFY_TOKEN = env("WEBHOOK_VERIFY_TOKEN", default="superadmin_verify_token_change_me")

# --- Automation Thresholds ---
MAX_CPA = env.float("MAX_CPA", default=600000.0)   # 600,000 VND / action (comment + inbox) — max chấp nhận được
MIN_ROAS = env.float("MIN_ROAS", default=2.0)
ANOMALY_CPA_MULTIPLIER = 3.0  # trigger alert if CPA > 3x baseline in 2h

# --- Automation Actions ---
# Set False to disable auto pause/scale — AI only analyzes and logs recommendations.
# Enable in production after full review (Phase Final).
AUTOMATION_ACTIONS_ENABLED = env.bool("AUTOMATION_ACTIONS_ENABLED", default=False)

# --- Conversion Tracking ---
# Primary pixel event counted as a conversion.
# Set to "lead" for lead-gen accounts. See Meta's action_type reference.
META_CONVERSION_EVENT = env("META_CONVERSION_EVENT", default="offsite_conversion.fb_pixel_purchase")
META_LEAD_EVENT = env("META_LEAD_EVENT", default="lead")
# Beauty clinic: CPA = spend / (comments + inbox messages)
META_COMMENT_EVENT = env("META_COMMENT_EVENT", default="comment")
META_MESSAGE_EVENT = env("META_MESSAGE_EVENT", default="onsite_conversion.messaging_conversation_started_7d")
