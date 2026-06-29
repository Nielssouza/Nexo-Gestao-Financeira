import pytest
from rest_framework.test import APIClient
from django.urls import reverse


@pytest.mark.django_db
def test_list_shopping_lists_returns_only_tenant_data(baker):
    """Listagem retorna apenas listas do tenant do usuario."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_user = baker.make("auth.User")
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    baker.make("tenants.TenantMembership", user=other_user, tenant=other_tenant)

    baker.make("shopping.ShoppingList", user=user, tenant=tenant, name="Lista Minha")
    baker.make("shopping.ShoppingList", user=other_user, tenant=other_tenant, name="Lista Alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:shoppinglist-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    names = [r["name"] for r in response.data["results"]]
    assert "Lista Minha" in names
    assert "Lista Alheia" not in names


@pytest.mark.django_db
def test_create_shopping_list(baker):
    """Criacao de lista de compras deve retornar 201."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:shoppinglist-list")
    response = client.post(
        url,
        {"name": "Feira Semanal"},
        HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 201
    assert response.data["name"] == "Feira Semanal"


@pytest.mark.django_db
def test_delete_shopping_list(baker):
    """Exclusao de lista deve retornar 204."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    sl = baker.make("shopping.ShoppingList", user=user, tenant=tenant, name="Para Deletar")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:shoppinglist-detail", args=[sl.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 204


@pytest.mark.django_db
def test_shopping_list_unauthenticated_returns_401(baker):
    """Sem autenticacao, a API retorna 401."""
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:shoppinglist-list")
    response = client.get(url)
    assert response.status_code == 401
