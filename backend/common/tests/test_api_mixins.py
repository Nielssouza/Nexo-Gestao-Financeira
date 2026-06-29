import pytest
from unittest.mock import Mock
from rest_framework.exceptions import PermissionDenied
from common.api_mixins import get_user_tenant
from tenants.models import TenantMembership

pytestmark = pytest.mark.django_db

def test_get_user_tenant_with_no_request_and_no_tenant(baker):
    user = baker.make("auth.User")
    with pytest.raises(PermissionDenied, match="Usuário não possui tenant ativo."):
        get_user_tenant(user)

def test_get_user_tenant_with_default_tenant(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    
    result = get_user_tenant(user)
    assert result == tenant

def test_get_user_tenant_with_explicit_valid_tenant_id(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    
    request = Mock()
    request.headers = {"X-Tenant-ID": str(tenant.id)}
    
    result = get_user_tenant(user, request)
    assert result == tenant

def test_get_user_tenant_with_explicit_invalid_tenant_id(baker):
    user = baker.make("auth.User")
    tenant1 = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    tenant2 = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant1, is_default=True)
    
    request = Mock()
    request.headers = {"X-Tenant-ID": str(tenant2.id)}
    
    with pytest.raises(PermissionDenied, match="Usuario sem acesso ao tenant selecionado."):
        get_user_tenant(user, request)
