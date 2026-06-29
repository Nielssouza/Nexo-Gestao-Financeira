import pytest
from model_bakery import baker as model_baker

@pytest.fixture
def baker():
    return model_baker

@pytest.fixture(autouse=True)
def use_dummy_cache(settings):
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "unique-snowflake",
        }
    }
