import pytest
from django.urls import reverse
from rest_framework.test import APIClient

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
