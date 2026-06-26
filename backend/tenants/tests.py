from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from tenants.models import NfseCredential, Tenant, TenantMembership


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

    @patch("tenants.views.urlopen")
    def test_cep_lookup_view_prefills_address_data(self, mock_urlopen):
        payload = (
            b'{"logradouro":"Rua Exemplo","bairro":"Centro","localidade":"Goiania",'
            b'"uf":"GO","cep":"74000-000","complemento":"Sala 1"}'
        )
        mock_response = MagicMock()
        mock_response.read.return_value = payload
        mock_urlopen.return_value.__enter__.return_value = mock_response

        response = self.client.get(reverse("tenants:cep-lookup", args=["74000000"]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "address": "Rua Exemplo",
                "district": "Centro",
                "city": "Goiania",
                "state": "GO",
                "postal_code": "74000-000",
                "complement": "Sala 1",
            },
        )

    def test_cep_lookup_view_rejects_invalid_cep(self):
        response = self.client.get(reverse("tenants:cep-lookup", args=["123"]))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "CEP invalido.")

    def test_tenant_update_view_post(self):
        response = self.client.post(
            reverse("tenants:update"),
            {
                "name": "New Name",
                "document": "12.345.678/0001-99",
                "email": "contact@newname.com",
                "phone": "11999999999",
                "address": "Rua Teste",
                "address_number": "123",
                "address_complement": "Sala 4",
                "district": "Centro",
                "city": "Sao Paulo",
                "state": "sp",
                "postal_code": "01001-000",
                "default_interface": Tenant.InterfaceChoices.CLASSIC,
            },
        )
        self.assertEqual(response.status_code, 302)

        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, "New Name")
        self.assertEqual(self.tenant.document, "12.345.678/0001-99")
        self.assertEqual(self.tenant.email, "contact@newname.com")
        self.assertEqual(self.tenant.address, "Rua Teste")
        self.assertEqual(self.tenant.address_number, "123")
        self.assertEqual(self.tenant.address_complement, "Sala 4")
        self.assertEqual(self.tenant.district, "Centro")
        self.assertEqual(self.tenant.city, "Sao Paulo")
        self.assertEqual(self.tenant.state, "SP")
        self.assertEqual(self.tenant.postal_code, "01001-000")

    def test_tenant_full_address_formats_complete_address(self):
        self.tenant.address = "Rua Teste"
        self.tenant.address_number = "123"
        self.tenant.address_complement = "Sala 4"
        self.tenant.district = "Centro"
        self.tenant.city = "Sao Paulo"
        self.tenant.state = "SP"
        self.tenant.postal_code = "01001-000"

        self.assertEqual(
            self.tenant.full_address,
            "Rua Teste, 123, Sala 4, Centro | Sao Paulo - SP | CEP 01001-000",
        )


class TenantApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="tenant-api-user",
            password="123",
        )
        self.tenant = self.user.tenant_memberships.get().tenant
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_tenant_profile_api_updates_current_tenant(self):
        response = self.client.patch(
            "/api/v1/tenant/",
            {
                "name": "Empresa API",
                "document": "12.345.678/0001-99",
                "email": "contato@empresa.test",
                "address": "Rua API",
                "address_number": "42",
                "city": "Goiania",
                "state": "GO",
                "postal_code": "74000-000",
                "default_interface": Tenant.InterfaceChoices.REACT,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.name, "Empresa API")
        self.assertEqual(self.tenant.default_interface, Tenant.InterfaceChoices.REACT)
        self.assertEqual(self.tenant.state, "GO")

    @patch("tenants.api_views.urlopen")
    def test_cep_lookup_api_returns_address_data(self, mock_urlopen):
        payload = (
            b'{"logradouro":"Rua API","bairro":"Centro","localidade":"Goiania",'
            b'"uf":"GO","cep":"74000-000","complemento":"Sala 2"}'
        )
        mock_response = MagicMock()
        mock_response.read.return_value = payload
        mock_urlopen.return_value.__enter__.return_value = mock_response

        response = self.client.get("/api/v1/cep/74000000/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["address"], "Rua API")
        self.assertEqual(response.data["city"], "Goiania")
        self.assertEqual(response.data["state"], "GO")

    def test_cep_lookup_api_rejects_invalid_cep(self):
        response = self.client.get("/api/v1/cep/123/")

        self.assertEqual(response.status_code, 400)

    def test_nfse_credential_api_encrypts_and_hides_password(self):
        response = self.client.post(
            "/api/v1/nfse-credentials/",
            {"gov_br_cpf": "12345678901", "gov_br_password": "senha-secreta"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("gov_br_password", response.data)
        self.assertNotIn("gov_br_password_enc", response.data)
        self.assertTrue(response.data["has_password"])
        credential = NfseCredential.objects.get(tenant=self.tenant)
        self.assertNotEqual(credential.gov_br_password_enc, "senha-secreta")

    def test_nfse_credential_api_updates_without_replacing_password_when_blank(self):
        create_response = self.client.post(
            "/api/v1/nfse-credentials/",
            {"gov_br_cpf": "12345678901", "gov_br_password": "senha-secreta"},
            format="json",
        )
        credential = NfseCredential.objects.get(tenant=self.tenant)
        encrypted = credential.gov_br_password_enc

        update_response = self.client.patch(
            f"/api/v1/nfse-credentials/{create_response.data['id']}/",
            {"gov_br_cpf": "10987654321", "gov_br_password": ""},
            format="json",
        )

        self.assertEqual(update_response.status_code, 200)
        credential.refresh_from_db()
        self.assertEqual(credential.gov_br_cpf, "10987654321")
        self.assertEqual(credential.gov_br_password_enc, encrypted)
