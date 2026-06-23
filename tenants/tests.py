from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from accounts.models import Account
from tenants.models import Tenant, TenantMembership


class TenantIsolationTests(TestCase):
    def test_new_user_gets_default_tenant_membership(self):
        user = get_user_model().objects.create_user(
            username="tenant-owner",
            password="tenant-pass-123",
        )

        membership = TenantMembership.objects.select_related("tenant").get(
            user=user,
            is_default=True,
        )

        self.assertEqual(membership.role, TenantMembership.Role.OWNER)
        self.assertEqual(membership.tenant.owner, user)
        self.assertTrue(membership.tenant.is_active)

    def test_models_auto_assign_default_tenant_from_user(self):
        user = get_user_model().objects.create_user(
            username="tenant-auto",
            password="tenant-pass-123",
        )

        account = Account.objects.create(
            user=user,
            name="Conta Auto",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("10.00"),
        )

        membership = TenantMembership.objects.get(user=user, is_default=True)
        self.assertEqual(account.tenant_id, membership.tenant_id)

    def test_account_list_uses_active_tenant_scope(self):
        user_model = get_user_model()
        owner = user_model.objects.create_user(
            username="tenant-owner-shared",
            password="tenant-pass-123",
        )
        member = user_model.objects.create_user(
            username="tenant-member",
            password="tenant-pass-123",
        )

        shared_tenant = Tenant.objects.create(
            name="Cliente Compartilhado",
            slug="cliente-compartilhado",
            owner=owner,
        )
        TenantMembership.objects.create(
            tenant=shared_tenant,
            user=owner,
            role=TenantMembership.Role.ADMIN,
            is_default=False,
        )
        TenantMembership.objects.create(
            tenant=shared_tenant,
            user=member,
            role=TenantMembership.Role.MEMBER,
            is_default=False,
        )

        shared_account = Account.objects.create(
            user=owner,
            tenant=shared_tenant,
            name="Conta Compartilhada",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("100.00"),
        )
        private_account = Account.objects.create(
            user=owner,
            name="Conta Privada",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("50.00"),
        )

        self.client.force_login(member)
        session = self.client.session
        session["active_tenant_id"] = shared_tenant.pk
        session.save()

        response = self.client.get(reverse("accounts:list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, shared_account.name)
        self.assertNotContains(response, private_account.name)

class TenantViewsTest(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="tenant-updater",
            password="123",
        )
        self.tenant = self.user.tenant_memberships.get().tenant
        self.tenant.name = "Old Name"
        self.tenant.slug = "old-name"
        self.tenant.save()
        self.client.login(username="tenant-updater", password="123")

    def test_tenant_update_view_get(self):
        response = self.client.get(reverse("tenants:update"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "tenants/tenant_form.html")

    def test_tenant_update_view_post(self):
        response = self.client.post(reverse("tenants:update"), {
            "name": "New Name",
            "document": "12.345.678/0001-99",
            "email": "contact@newname.com",
            "phone": "11999999999",
            "address": "Rua Teste, 123",
            "city": "São Paulo",
        })
        self.assertEqual(response.status_code, 302)
        
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, "New Name")
        self.assertEqual(self.tenant.document, "12.345.678/0001-99")
        self.assertEqual(self.tenant.email, "contact@newname.com")
