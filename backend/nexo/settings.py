"""Django settings for nexo project."""

import os
import sys
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


TESTING = "test" in sys.argv
RUNSERVER = "runserver" in sys.argv
HEROKU_DYNO = bool(os.getenv("DYNO"))

_debug_env = os.getenv("DJANGO_DEBUG")
if _debug_env is None:
    DEBUG = RUNSERVER
else:
    DEBUG = env_bool("DJANGO_DEBUG", default=False)

import secrets as _secrets

_secret_key_env = os.getenv("DJANGO_SECRET_KEY")
_secret_key_required = (
    HEROKU_DYNO
    or bool(os.getenv("DATABASE_URL", "").strip())
    or env_bool("DJANGO_REQUIRE_SECRET_KEY", default=False)
)
if _secret_key_env:
    SECRET_KEY = _secret_key_env
elif TESTING:
    SECRET_KEY = "test-only-insecure-key-not-for-production"
elif RUNSERVER:
    import warnings
    SECRET_KEY = _secrets.token_urlsafe(50)
    warnings.warn(
        "DJANGO_SECRET_KEY not set. A random key is being used — sessions will not persist across server restarts.",
        stacklevel=2,
    )
else:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set for deployed environments.")

_allowed_hosts_default = "127.0.0.1,localhost"
if HEROKU_DYNO:
    _allowed_hosts_default += ",.herokuapp.com"

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", _allowed_hosts_default)
if HEROKU_DYNO and ".herokuapp.com" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(".herokuapp.com")

default_primary_host = "nexo.dscorp.top"
if default_primary_host not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(default_primary_host)

CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")
if HEROKU_DYNO and not any("herokuapp.com" in origin for origin in CSRF_TRUSTED_ORIGINS):
    CSRF_TRUSTED_ORIGINS.append("https://*.herokuapp.com")
if f"https://{default_primary_host}" not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append(f"https://{default_primary_host}")

PUBLIC_SIGNUP_ENABLED = env_bool(
    "PUBLIC_SIGNUP_ENABLED",
    default=RUNSERVER and (not TESTING) and (not HEROKU_DYNO),
)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    # Local apps
    "tenants.apps.TenantsConfig",
    "users",
    "accounts",
    "categories",
    "transactions",
    "dashboard",
    "shopping",
    "investments.apps.InvestmentsConfig",
    "invoices.apps.InvoicesConfig",
] + (["django_browser_reload"] if RUNSERVER else [])

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "tenants.middleware.CurrentTenantMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "nexo.middleware.ContentSecurityPolicyMiddleware",
] + (["django_browser_reload.middleware.BrowserReloadMiddleware"] if RUNSERVER else [])

ROOT_URLCONF = "nexo.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.template.context_processors.debug",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "nexo.context_processors.app_flags",
            ],
        },
    },
]

WSGI_APPLICATION = "nexo.wsgi.application"


use_sqlite = env_bool("USE_SQLITE", default=False)
database_url = os.getenv("DATABASE_URL", "").strip()
postgres_hint_enabled = bool(database_url or os.getenv("POSTGRES_DB") or os.getenv("POSTGRES_HOST"))
use_postgres = env_bool("USE_POSTGRES", default=postgres_hint_enabled)

if use_sqlite:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
elif database_url:
    DATABASES = {
        "default": dj_database_url.parse(
            database_url,
            conn_max_age=int(os.getenv("DATABASE_CONN_MAX_AGE", "600")),
            ssl_require=env_bool("DATABASE_SSL_REQUIRE", default=HEROKU_DYNO),
        )
    }
    DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
elif use_postgres:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "financas"),
            "USER": os.getenv("POSTGRES_USER", "postgres"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),
            "HOST": os.getenv("POSTGRES_HOST", "localhost"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
            "OPTIONS": {
                "connect_timeout": 5,
            },
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "pt-br"

TIME_ZONE = "America/Sao_Paulo"

USE_I18N = True

USE_TZ = True
USE_THOUSAND_SEPARATOR = True


STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

_BUCKETEER_BUCKET = os.getenv("BUCKETEER_BUCKET_NAME")
if _BUCKETEER_BUCKET:
    AWS_ACCESS_KEY_ID = os.getenv("BUCKETEER_AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("BUCKETEER_AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = _BUCKETEER_BUCKET
    AWS_S3_REGION_NAME = os.getenv("BUCKETEER_AWS_REGION", "us-east-1")
    AWS_DEFAULT_ACL = None
    AWS_S3_FILE_OVERWRITE = False
    AWS_QUERYSTRING_AUTH = True
    MEDIA_URL = f"https://{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_S3_REGION_NAME}.amazonaws.com/media/"
    _DEFAULT_FILE_BACKEND = "storages.backends.s3boto3.S3Boto3Storage"
else:
    _DEFAULT_FILE_BACKEND = "django.core.files.storage.FileSystemStorage"

STORAGES = {
    "default": {
        "BACKEND": _DEFAULT_FILE_BACKEND,
    },
    "staticfiles": {
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if not DEBUG
            else "django.contrib.staticfiles.storage.StaticFilesStorage"
        )
    },
}


LOGIN_URL = "/admin/login/"
LOGIN_REDIRECT_URL = "/admin/"
LOGOUT_REDIRECT_URL = "/admin/login/"
AUTHENTICATION_BACKENDS = [
    "users.backends.EmailOnlyBackend",
    "django.contrib.auth.backends.ModelBackend",
]


# Production security defaults (override via env when needed)
default_secure_mode = (not DEBUG) and (not TESTING) and (not RUNSERVER)
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", default=default_secure_mode)
SECURE_HSTS_SECONDS = int(
    os.getenv("DJANGO_SECURE_HSTS_SECONDS", "31536000" if default_secure_mode else "0")
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", default=default_secure_mode
)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", default=default_secure_mode)

SESSION_COOKIE_SECURE = env_bool(
    "DJANGO_SESSION_COOKIE_SECURE", default=default_secure_mode
)
CSRF_COOKIE_SECURE = env_bool(
    "DJANGO_CSRF_COOKIE_SECURE", default=default_secure_mode
)
SESSION_COOKIE_HTTPONLY = env_bool("DJANGO_SESSION_COOKIE_HTTPONLY", default=True)
# CSRF_COOKIE_HTTPONLY mantido False — HTMX lê o token do cookie via JS
CSRF_COOKIE_HTTPONLY = env_bool("DJANGO_CSRF_COOKIE_HTTPONLY", default=False)

SESSION_COOKIE_SAMESITE = os.getenv("DJANGO_SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SAMESITE = os.getenv("DJANGO_CSRF_COOKIE_SAMESITE", "Lax")

SECURE_CONTENT_TYPE_NOSNIFF = env_bool(
    "DJANGO_SECURE_CONTENT_TYPE_NOSNIFF", default=True
)
SECURE_REFERRER_POLICY = os.getenv("DJANGO_SECURE_REFERRER_POLICY", "same-origin")
X_FRAME_OPTIONS = os.getenv("DJANGO_X_FRAME_OPTIONS", "DENY")

if HEROKU_DYNO and not os.getenv("DJANGO_SECURE_PROXY_SSL_HEADER"):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

_proxy_ssl_header = os.getenv("DJANGO_SECURE_PROXY_SSL_HEADER", "")
if _proxy_ssl_header:
    _parts = [part.strip() for part in _proxy_ssl_header.split(",", 1)]
    if len(_parts) == 2 and _parts[0] and _parts[1]:
        SECURE_PROXY_SSL_HEADER = (_parts[0], _parts[1])



LOCAL_DEVELOPMENT = DEBUG or RUNSERVER
if LOCAL_DEVELOPMENT:
    # Mantem desenvolvimento local em HTTP para evitar redirects 301/HTTPS no runserver.
    SECURE_SSL_REDIRECT = False
    SECURE_HSTS_SECONDS = 0
    SECURE_HSTS_INCLUDE_SUBDOMAINS = False
    SECURE_HSTS_PRELOAD = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        "login": "10/min",
        "cnpj_lookup": "60/hour",
        "nfse_emit": "10/hour",
        "cep_lookup": "60/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# CORS: allow the separately deployed React app to call the API.
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
CORS_ALLOWED_ORIGIN_REGEXES = env_list("CORS_ALLOWED_ORIGIN_REGEXES", "")
CORS_ALLOW_CREDENTIALS = env_bool("CORS_ALLOW_CREDENTIALS", default=False)
CORS_URLS_REGEX = r"^/api/v1/.*$"

for origin in CORS_ALLOWED_ORIGINS:
    if origin.startswith(("http://", "https://")) and origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(origin)

# Celery
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_SOFT_TIME_LIMIT = 240   # 4 min — SoftTimeLimitExceeded (capturável)
CELERY_TASK_TIME_LIMIT = 270        # 4.5 min — kill forçado (fallback)

# Cache — usa Redis se disponível (necessário para rate limiting em múltiplos dynos),
# caso contrário cai para memória local (funciona em single-process).
_redis_url = os.getenv("REDIS_URL", "")
if _redis_url:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }

# Rate limiting (django-ratelimit)
RATELIMIT_USE_CACHE = "default"
RATELIMIT_FAIL_OPEN = False  # em caso de falha do cache, bloqueia (seguro)

