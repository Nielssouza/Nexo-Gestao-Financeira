"""Django settings for nexo project."""

import os
import sys
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
    "tenants.apps.TenantsConfig",
    "users",
    "accounts",
    "categories",
    "transactions",
    "dashboard",
    "goals",
    "shopping",
] + (["django_browser_reload"] if RUNSERVER else [])

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "tenants.middleware.CurrentTenantMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
] + (["django_browser_reload.middleware.BrowserReloadMiddleware"] if RUNSERVER else [])

ROOT_URLCONF = "nexo.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
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


STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if not DEBUG
            else "django.contrib.staticfiles.storage.StaticFilesStorage"
        )
    },
}


LOGIN_URL = "users:login"
LOGIN_REDIRECT_URL = "dashboard:home"
LOGOUT_REDIRECT_URL = "users:login"
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

