import pytest
import tempfile
from django.urls import reverse
from rest_framework.test import APIClient

from users.api_views import detect_backup_format, prepare_restore_sql, rewrite_restore_sql

pytestmark = pytest.mark.django_db

def test_login_returns_cookies_on_success(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="test@example.com", is_active=True)
    user.set_password("password123")
    user.save()
    
    url = reverse("api:token_obtain")
    
    response = client.post(url, {"username": "test@example.com", "password": "password123"})
    
    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies

def test_login_returns_401_on_invalid_credentials(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="test@example.com", is_active=True)
    user.set_password("password123")
    user.save()
    
    url = reverse("api:token_obtain")
    
    response = client.post(url, {"username": "test@example.com", "password": "wrong"})
    
    assert response.status_code == 401
    assert "access_token" not in response.cookies

def test_me_returns_403_if_no_tenant_access(baker):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    user = baker.make("auth.User", email="test@example.com", is_active=True)
    
    # We must force authentication since we don't have the cookies
    client.force_authenticate(user=user)
    
    url = reverse("api:me")
    
    response = client.get(url)
    # The get_user_tenant function should raise 403 Forbidden 
    # since we haven't created a TenantMembership for this user
    assert response.status_code == 403


def test_detect_backup_format_identifies_sql_without_extension():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(b"-- PostgreSQL database dump\nSET search_path = public;\nCREATE TABLE test (id integer);\n")
        tmp_path = tmp.name

    assert detect_backup_format(tmp_path, "24e2dec7-a659-4ddc-9e4e-22e2b25c9609") == "sql"


def test_detect_backup_format_identifies_custom_archive_by_signature():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(b"PGDMP\x01\x0e\x00\x04\x08")
        tmp_path = tmp.name

    assert detect_backup_format(tmp_path, "backup-sem-extensao") == "archive"


def test_rewrite_restore_sql_replaces_public_schema_references():
    sql = "\n".join([
        'SET search_path = "public", pg_catalog;',
        'CREATE SCHEMA "public";',
        'ALTER SCHEMA "public" OWNER TO postgres;',
        'COMMENT ON SCHEMA "public" IS \'standard public schema\';',
        'CREATE TABLE public.auth_user (id integer);',
    ])

    rewritten = rewrite_restore_sql(sql, "nexo")

    assert '"public".' not in rewritten
    assert "public.auth_user" not in rewritten
    assert 'CREATE SCHEMA "nexo";' in rewritten
    assert 'ALTER SCHEMA "nexo" OWNER TO postgres;' in rewritten
    assert 'COMMENT ON SCHEMA "nexo" IS \'standard public schema\';' in rewritten
    assert 'CREATE TABLE "nexo".auth_user (id integer);' in rewritten


def test_prepare_restore_sql_bootstraps_public_schema():
    prepared = prepare_restore_sql("CREATE TABLE public.auth_user (id integer);", "nexo")

    assert prepared.startswith("CREATE SCHEMA IF NOT EXISTS public;")
    assert 'CREATE TABLE "nexo".auth_user (id integer);' in prepared
