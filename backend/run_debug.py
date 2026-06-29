import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.test.utils import setup_test_environment
setup_test_environment()

from django.test import RequestFactory
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from tenants.models import Tenant, TenantMembership
from invoices.models import Invoice

client = APIClient()
user = User.objects.create_user(username="apiuser2", password="123")
tenant = Tenant.objects.create(name="API Tenant 2", slug="api-tenant-2", owner=user, document="12345678901")
TenantMembership.objects.create(tenant=tenant, user=user, role=TenantMembership.Role.OWNER, is_default=True)

client.force_authenticate(user)
response = client.get('/api/v1/invoices/')
print("STATUS:", response.status_code)
print("CONTENT:", response.content)
