from datetime import date
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from accounts.models import Account
from invoices.models import Client, Invoice
from tenants.models import Tenant
from transactions.models import Transaction

User = get_user_model()


@override_settings(STATICFILES_STORAGE="django.contrib.staticfiles.storage.StaticFilesStorage")
class InvoicesViewsTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="123")
        self.tenant = self.user.tenant_memberships.get().tenant
        self.client.login(username="testuser", password="123")
        self.account = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Banco Principal",
            account_type=Account.AccountType.BANK,
        )
        
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
        self.assertContains(response, "Lancar no financeiro")
        self.assertContains(response, "Sim, lancar automaticamente")
        self.assertContains(response, "Nao lancar agora")

    def test_invoice_create_without_financial_launch_does_not_create_transaction(self):
        response = self.client.post(
            reverse("invoices:create"),
            data={
                "issue_date": "2026-06-23",
                "due_date": "2026-06-30",
                "client_name": "Cliente Sem Lancamento",
                "client_document": "",
                "client_email": "",
                "client_phone": "",
                "client_address": "",
                "client_city": "",
                "service_code": "1.01",
                "service_description": "Servico prestado",
                "gross_value": "500,00",
                "launch_financial": "0",
                "expected_account": self.account.pk,
                "notes": "",
                "save_client": "0",
            },
        )

        invoice = Invoice.objects.get(client_name="Cliente Sem Lancamento")
        self.assertRedirects(response, reverse("invoices:detail", kwargs={"pk": invoice.pk}))
        self.assertIsNone(invoice.transaction)
        self.assertFalse(Transaction.objects.filter(description__contains=invoice.number_display).exists())

    def test_invoice_create_with_financial_launch_creates_transaction(self):
        response = self.client.post(
            reverse("invoices:create"),
            data={
                "issue_date": "2026-06-23",
                "due_date": "2026-06-30",
                "client_name": "Cliente Com Lancamento",
                "client_document": "",
                "client_email": "",
                "client_phone": "",
                "client_address": "",
                "client_city": "",
                "service_code": "1.01",
                "service_description": "Servico prestado",
                "gross_value": "750,00",
                "launch_financial": "1",
                "expected_account": self.account.pk,
                "notes": "",
                "save_client": "0",
            },
        )

        invoice = Invoice.objects.get(client_name="Cliente Com Lancamento")
        self.assertRedirects(response, reverse("invoices:detail", kwargs={"pk": invoice.pk}))
        self.assertIsNotNone(invoice.transaction)
        self.assertEqual(invoice.transaction.account, self.account)
        self.assertEqual(invoice.transaction.transaction_type, Transaction.TransactionType.INCOME)
        self.assertFalse(invoice.transaction.is_cleared)

    def test_invoice_create_with_auto_launch_requires_account(self):
        response = self.client.post(
            reverse("invoices:create"),
            data={
                "issue_date": "2026-06-23",
                "due_date": "2026-06-30",
                "client_name": "Cliente Sem Conta",
                "client_document": "",
                "client_email": "",
                "client_phone": "",
                "client_address": "",
                "client_city": "",
                "service_code": "1.01",
                "service_description": "Servico prestado",
                "gross_value": "750,00",
                "launch_financial": "1",
                "expected_account": "",
                "notes": "",
                "save_client": "0",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response,
            "Selecione a conta para lancar a fatura automaticamente no financeiro.",
        )
        self.assertFalse(Invoice.objects.filter(client_name="Cliente Sem Conta").exists())

    def test_invoice_update_can_remove_pending_financial_launch(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=20,
            gross_value=300.00,
            status=Invoice.ISSUED,
            issue_date=date(2026, 6, 23),
            due_date=date(2026, 6, 30),
            client_name="Cliente Atualizado",
            service_code="1.01",
            service_description="Servico original",
            expected_account=self.account,
        )
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=300.00,
            date="2026-06-30",
            account=self.account,
            description=f"Fatura {invoice.number_display} - {invoice.client_name}",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        invoice.transaction = transaction
        invoice.save(update_fields=["transaction"])

        response = self.client.post(
            reverse("invoices:update", args=[invoice.pk]),
            data={
                "issue_date": "2026-06-23",
                "due_date": "2026-06-30",
                "client_name": "Cliente Atualizado",
                "client_document": "",
                "client_email": "",
                "client_phone": "",
                "client_address": "",
                "client_city": "",
                "service_code": "1.01",
                "service_description": "Servico original",
                "gross_value": "300,00",
                "launch_financial": "0",
                "expected_account": self.account.pk,
                "notes": "",
            },
        )

        self.assertRedirects(response, reverse("invoices:detail", kwargs={"pk": invoice.pk}))
        invoice.refresh_from_db()
        self.assertIsNone(invoice.transaction)
        self.assertFalse(Transaction.objects.filter(pk=transaction.pk).exists())

    def test_invoice_detail_shows_pay_financial_option(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=30,
            gross_value=400.00,
            status=Invoice.ISSUED,
            issue_date=date(2026, 6, 23),
            due_date=date(2026, 6, 30),
            client_name="Cliente Recebimento",
            service_code="1.01",
            service_description="Servico",
        )

        response = self.client.get(reverse("invoices:detail", args=[invoice.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Sim, registrar recebimento")
        self.assertContains(response, "Nao lancar agora")

    def test_invoice_pay_without_financial_launch_marks_paid_without_transaction(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=31,
            gross_value=420.00,
            status=Invoice.ISSUED,
            issue_date=date(2026, 6, 23),
            due_date=date(2026, 6, 30),
            client_name="Cliente Pago Sem Lancamento",
            service_code="1.01",
            service_description="Servico",
        )

        response = self.client.post(
            reverse("invoices:pay", args=[invoice.pk]),
            data={
                "launch_financial": "0",
                "account": "",
                "paid_at": "2026-06-25",
            },
        )

        self.assertRedirects(response, reverse("invoices:detail", kwargs={"pk": invoice.pk}))
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.PAID)
        self.assertEqual(invoice.paid_at, date(2026, 6, 25))
        self.assertIsNone(invoice.transaction)

    def test_invoice_pay_without_financial_launch_removes_pending_transaction(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=32,
            gross_value=430.00,
            status=Invoice.ISSUED,
            issue_date=date(2026, 6, 23),
            due_date=date(2026, 6, 30),
            client_name="Cliente Pago Sem Financeiro",
            service_code="1.01",
            service_description="Servico",
            expected_account=self.account,
        )
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=430.00,
            date=date(2026, 6, 30),
            account=self.account,
            description=f"Fatura {invoice.number_display} - {invoice.client_name}",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        invoice.transaction = transaction
        invoice.save(update_fields=["transaction"])

        response = self.client.post(
            reverse("invoices:pay", args=[invoice.pk]),
            data={
                "launch_financial": "0",
                "account": "",
                "paid_at": "2026-06-26",
            },
        )

        self.assertRedirects(response, reverse("invoices:detail", kwargs={"pk": invoice.pk}))
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.PAID)
        self.assertIsNone(invoice.transaction)
        self.assertFalse(Transaction.objects.filter(pk=transaction.pk).exists())

    def test_invoice_pay_with_financial_launch_requires_account(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=33,
            gross_value=440.00,
            status=Invoice.ISSUED,
            issue_date=date(2026, 6, 23),
            due_date=date(2026, 6, 30),
            client_name="Cliente Pago Com Validacao",
            service_code="1.01",
            service_description="Servico",
        )

        response = self.client.post(
            reverse("invoices:pay", args=[invoice.pk]),
            data={
                "launch_financial": "1",
                "account": "",
                "paid_at": "2026-06-26",
            },
            follow=True,
        )

        self.assertRedirects(response, reverse("invoices:detail", kwargs={"pk": invoice.pk}))
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.ISSUED)
        self.assertContains(response, "Revise os dados do recebimento.")

    def test_invoice_pay_with_financial_launch_creates_cleared_transaction(self):
        invoice = Invoice.objects.create(
            tenant=self.tenant,
            user=self.user,
            number=34,
            gross_value=450.00,
            status=Invoice.ISSUED,
            issue_date=date(2026, 6, 23),
            due_date=date(2026, 6, 30),
            client_name="Cliente Pago Com Lancamento",
            service_code="1.01",
            service_description="Servico",
        )

        response = self.client.post(
            reverse("invoices:pay", args=[invoice.pk]),
            data={
                "launch_financial": "1",
                "account": self.account.pk,
                "paid_at": "2026-06-27",
            },
        )

        self.assertRedirects(response, reverse("invoices:detail", kwargs={"pk": invoice.pk}))
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.PAID)
        self.assertIsNotNone(invoice.transaction)
        self.assertTrue(invoice.transaction.is_cleared)
        self.assertEqual(invoice.transaction.account, self.account)

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
