from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from invoices.models import Invoice
from tenants.models import Tenant, TenantMembership
from transactions.models import Transaction

User = get_user_model()


class InvoiceApiViewSetTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="apiuser", password="123")
        self.tenant = Tenant.objects.create(
            name="API Tenant",
            slug="api-tenant",
            owner=self.user,
            document="12345678901",
        )
        TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.user,
            role=TenantMembership.Role.OWNER,
            is_default=True,
        )
        self.client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
        self.client.force_authenticate(self.user)
        self.account = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Banco Principal",
            account_type=Account.AccountType.BANK,
        )

    def _create_invoice(self, **overrides):
        data = {
            "tenant": self.tenant,
            "user": self.user,
            "number": Invoice.next_number(self.tenant),
            "gross_value": "500.00",
            "status": Invoice.ISSUED,
            "issue_date": date(2026, 6, 23),
            "due_date": date(2026, 6, 30),
            "client_name": "Cliente API",
            "service_code": "1.01",
            "service_description": "Servico prestado",
        }
        data.update(overrides)
        return Invoice.objects.create(**data)

    def test_create_invoice_api_marks_as_issued(self):
        response = self.client.post(
            "/api/v1/invoices/",
            data={
                "issue_date": "2026-06-23",
                "due_date": "2026-06-30",
                "client_name": "Cliente Novo",
                "service_code": "1.01",
                "service_description": "Servico prestado",
                "gross_value": "750.00",
                "launch_financial": False,
                "save_client": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], Invoice.ISSUED)

    def test_pay_without_financial_launch_does_not_require_account(self):
        invoice = self._create_invoice()
        response = self.client.post(
            f"/api/v1/invoices/{invoice.pk}/pay/",
            data={
                "paid_at": "2026-06-26",
                "launch_financial": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.PAID)
        self.assertIsNone(invoice.transaction)

    def test_pay_with_financial_launch_requires_account(self):
        invoice = self._create_invoice()
        response = self.client.post(
            f"/api/v1/invoices/{invoice.pk}/pay/",
            data={
                "paid_at": "2026-06-26",
                "launch_financial": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("account", response.data)

    def test_pay_with_financial_launch_creates_transaction(self):
        invoice = self._create_invoice()
        response = self.client.post(
            f"/api/v1/invoices/{invoice.pk}/pay/",
            data={
                "paid_at": "2026-06-26",
                "launch_financial": True,
                "account": self.account.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, Invoice.PAID)
        self.assertIsNotNone(invoice.transaction)
        self.assertTrue(Transaction.objects.filter(pk=invoice.transaction_id).exists())

    def test_update_preserves_linked_transaction_when_launch_financial_is_omitted(self):
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.INCOME,
            amount="500.00",
            date=date(2026, 6, 30),
            account=self.account,
            description="Fatura 0001/2026 - Cliente API",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        invoice = self._create_invoice(
            expected_account=self.account,
            transaction=transaction,
        )

        response = self.client.patch(
            f"/api/v1/invoices/{invoice.pk}/",
            data={
                "due_date": "2026-07-15",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        invoice.refresh_from_db()
        transaction.refresh_from_db()
        self.assertEqual(invoice.transaction_id, transaction.id)
        self.assertEqual(transaction.date, date(2026, 7, 15))

    def test_update_removes_linked_transaction_when_launch_financial_is_false(self):
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.INCOME,
            amount="500.00",
            date=date(2026, 6, 30),
            account=self.account,
            description="Fatura 0001/2026 - Cliente API",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        invoice = self._create_invoice(
            expected_account=self.account,
            transaction=transaction,
        )

        response = self.client.patch(
            f"/api/v1/invoices/{invoice.pk}/",
            data={
                "launch_financial": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        invoice.refresh_from_db()
        self.assertIsNone(invoice.transaction_id)
        self.assertFalse(Transaction.objects.filter(pk=transaction.id).exists())

    def test_print_data_endpoint_returns_invoice_and_tenant(self):
        invoice = self._create_invoice()
        response = self.client.get(f"/api/v1/invoices/{invoice.pk}/print_data/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["invoice"]["id"], invoice.pk)
        self.assertEqual(response.data["tenant"]["id"], self.tenant.pk)
        self.assertIn("service_code_description", response.data)

    def test_nfse_guide_endpoint_returns_manual_fields(self):
        invoice = self._create_invoice()
        response = self.client.get(f"/api/v1/invoices/{invoice.pk}/nfse_guide/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["fields"]["client"]["name"], invoice.client_name)
        self.assertEqual(response.data["fields"]["service"]["competence"], "06/2026")
