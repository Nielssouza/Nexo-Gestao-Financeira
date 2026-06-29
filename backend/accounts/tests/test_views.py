import pytest
from django.urls import reverse
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

def setup_tenant(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant

def test_list_accounts_returns_only_tenant_accounts(baker):
    user, tenant1 = setup_tenant(baker)
    _, tenant2 = setup_tenant(baker)
    
    # Create accounts for both tenants
    account1 = baker.make("accounts.Account", tenant=tenant1, name="Tenant 1 Account")
    account2 = baker.make("accounts.Account", tenant=tenant2, name="Tenant 2 Account")
    
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    
    url = reverse("api:account-list") # Assumes a DefaultRouter or similar mapping
    # Adding X-Tenant-ID header
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant1.id))
    
    assert response.status_code == 200
    
    results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
    names = [acc["name"] for acc in results]
    
    assert "Tenant 1 Account" in names
    assert "Tenant 2 Account" not in names

def test_cannot_access_accounts_without_auth():
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:account-list")
    response = client.get(url)
    assert response.status_code == 401
