import json

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from common.api_mixins import is_view_only_superuser


def body_of(response):
    """Parse the actual rendered response bytes (not response.data — that's the
    live in-memory dict, and mutating it after render() is a silent no-op that
    never reaches the client; this is what a real browser would receive)."""
    return json.loads(response.content)

pytestmark = pytest.mark.django_db


def setup_tenant(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant


def test_is_view_only_superuser_true_without_membership(baker):
    superuser = baker.make("auth.User", is_superuser=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    assert is_view_only_superuser(superuser, tenant) is True


def test_is_view_only_superuser_false_with_membership(baker):
    superuser, tenant = setup_tenant(baker)
    superuser.is_superuser = True
    superuser.save()
    assert is_view_only_superuser(superuser, tenant) is False


def test_is_view_only_superuser_false_for_regular_user(baker):
    user, tenant = setup_tenant(baker)
    other_tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    assert is_view_only_superuser(user, other_tenant) is False


def test_superuser_browsing_foreign_tenant_gets_masked_amounts(baker):
    """End-to-end: superuser opens a tenant they don't belong to via X-Tenant-ID
    and must receive null for monetary fields, even though the account is real."""
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)
    baker.make(
        "accounts.Account", tenant=tenant, name="Conta Alheia",
        initial_balance="500.00", credit_limit=None,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:account-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    body = body_of(response)
    results = body.get("results", body) if isinstance(body, dict) else body
    account_data = next(a for a in results if a["name"] == "Conta Alheia")

    assert account_data["initial_balance"] is None
    assert account_data["balance"] is None


def test_owner_viewing_own_tenant_sees_real_amounts(baker):
    """Control: a normal member of the tenant must still see real values."""
    user, tenant = setup_tenant(baker)
    baker.make(
        "accounts.Account", tenant=tenant, name="Minha Conta",
        initial_balance="500.00", credit_limit=None,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    url = reverse("api:account-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    body = body_of(response)
    results = body.get("results", body) if isinstance(body, dict) else body
    account_data = next(a for a in results if a["name"] == "Minha Conta")

    assert account_data["initial_balance"] == "500.00"
    assert account_data["balance"] == "500.00"


def test_dashboard_masked_flag_and_amounts_for_foreign_tenant(baker):
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:dashboard")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    body = body_of(response)
    assert body["masked"] is True
    assert body["kpis"]["user_balance"] is None
    assert body["alerts"]["consolidated_balance"] is None
