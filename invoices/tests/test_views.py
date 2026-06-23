from datetime import date
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from invoices.models import Client, Invoice
from tenants.models import Tenant

User = get_user_model()


@override_settings(STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage")
class InvoicesViewsTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="123")
        self.tenant = self.user.tenant_memberships.get().tenant
        self.client.login(username="testuser", password="123")
        
    def test_invoice_list_view(self):
        response = self.client.get(reverse("invoices:list"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/invoice_list.html")

    @patch("invoices.views.timezone.localdate", return_value=date(2026, 6, 23))
    def test_invoice_list_view_renders_filter_dropdown_with_auto_submit(self, _mock_localdate):
        response = self.client.get(reverse("invoices:list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '<details class="card group">', html=False)
        self.assertContains(response, 'id="invoice-filters-form"', html=False)
        self.assertContains(response, 'onchange="this.form.submit()"', count=3, html=False)
        self.assertContains(response, 'value="2026-06-01"', html=False)
        self.assertContains(response, 'value="2026-06-30"', html=False)
        self.assertContains(response, "Limpar")
        self.assertNotContains(response, "Aplicar filtros")

    @patch("invoices.views.timezone.localdate", return_value=date(2026, 6, 23))
    def test_invoice_list_view_defaults_to_current_month(self, _mock_localdate):
        june_invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=8,
            gross_value=500.00,
            status=Invoice.ISSUED,
            issue_date="2026-06-10",
            due_date="2026-06-20",
            client_name="Cliente Junho",
            service_code="1.01",
            service_description="Servico Junho",
        )
        Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=9,
            gross_value=900.00,
            status=Invoice.ISSUED,
            issue_date="2026-07-02",
            due_date="2026-07-12",
            client_name="Cliente Julho",
            service_code="1.01",
            service_description="Servico Julho",
        )

        response = self.client.get(reverse("invoices:list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(response.context["invoices"]), [june_invoice])
        self.assertEqual(response.context["start_date"], "2026-06-01")
        self.assertEqual(response.context["end_date"], "2026-06-30")
        self.assertEqual(response.context["summary_invoice_count"], 1)
        self.assertEqual(response.context["summary_total_gross"], 500)

    def test_invoice_list_view_shows_filtered_summary(self):
        Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=10,
            gross_value=100.00,
            status=Invoice.ISSUED,
            issue_date="2026-01-10",
            due_date="2026-01-20",
            client_name="Cliente A",
            service_code="1.01",
            service_description="Servico A",
        )
        Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=11,
            gross_value=250.00,
            status=Invoice.PAID,
            issue_date="2026-02-05",
            due_date="2026-02-15",
            client_name="Cliente B",
            service_code="1.01",
            service_description="Servico B",
        )

        response = self.client.get(
            reverse("invoices:list"),
            {
                "status": Invoice.PAID,
                "start_date": "2026-02-01",
                "end_date": "2026-02-28",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(response.context["invoices"]), [Invoice.objects.get(number=11, tenant=self.tenant)])
        self.assertEqual(response.context["summary_invoice_count"], 1)
        self.assertEqual(response.context["summary_total_gross"], 250)

    def test_invoice_create_view(self):
        response = self.client.get(reverse("invoices:create"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/invoice_form.html")

    def test_client_list_view(self):
        response = self.client.get(reverse("invoices:client-list"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/client_list.html")

    def test_client_create_view(self):
        response = self.client.get(reverse("invoices:client-create"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "invoices/client_form.html")

    @patch("requests.get")
    def test_cnpj_lookup_api_format(self, mock_get):
        # Trigger an exception to test error handling
        mock_get.side_effect = Exception("API down")

        response = self.client.get(reverse("invoices:cnpj-lookup", args=["12345678901234"]))
        self.assertEqual(response.status_code, 502)
        data = response.json()
        self.assertIn("error", data)

    def test_invoice_cancel_view(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=1,
            gross_value=100.00,
            status=Invoice.ISSUED,
            issue_date="2026-01-01",
            due_date="2026-02-01",
            client_name="Test Client",
            service_code="1.01"
        )
        response = self.client.post(reverse("invoices:cancel", args=[invoice.pk]))
        self.assertEqual(response.status_code, 302)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.CANCELLED)

    def test_invoice_delete_view(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=2,
            gross_value=200.00,
            status=Invoice.CANCELLED,
            issue_date="2026-01-01",
            due_date="2026-02-01",
            client_name="Delete Me",
            service_code="1.01"
        )
        response = self.client.post(reverse("invoices:delete", args=[invoice.pk]))
        self.assertEqual(response.status_code, 302)
        self.assertFalse(Invoice.objects.filter(pk=invoice.pk).exists())

@override_settings(STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage")
class UnauthenticatedViewsTest(TestCase):
    def test_redirect_if_not_logged_in(self):
        response = self.client.get(reverse("invoices:list"))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith(reverse("users:login")))
