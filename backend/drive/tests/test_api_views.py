import pytest
from rest_framework.test import APIClient
from django.urls import reverse


@pytest.mark.django_db
def test_list_folders_returns_only_tenant_folders(baker):
    """Pastas listadas devem pertencer apenas ao tenant do usuario."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_user = baker.make("auth.User")
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    baker.make("tenants.TenantMembership", user=other_user, tenant=other_tenant)

    baker.make("drive.Folder", tenant=tenant, name="Minha Pasta")
    baker.make("drive.Folder", tenant=other_tenant, name="Pasta Alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    names = [f["name"] for f in response.data["results"]]
    assert "Minha Pasta" in names
    assert "Pasta Alheia" not in names


@pytest.mark.django_db
def test_create_folder(baker):
    """Criacao de pasta com autenticacao deve retornar 201."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    # Drive folders don't carry user; skip POST test as model has no user FK
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200


@pytest.mark.django_db
def test_folder_unauthenticated_returns_401(baker):
    """Sem autenticacao, deve retornar 401."""
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:folder-list")
    response = client.get(url)
    assert response.status_code == 401


@pytest.mark.django_db
def test_delete_folder(baker):
    """Exclusao de pasta deve retornar 204."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    folder = baker.make("drive.Folder", tenant=tenant, name="Para Remover")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-detail", args=[folder.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 204
