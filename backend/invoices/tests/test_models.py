from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase

from invoices.models import Client, Invoice
from tenants.models import Tenant

User = get_user_model()


class ClientModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="123")
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            slug="test-tenant",
            owner=self.user,
            document="12345678901",
        )
        self.client = Client.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Test Client",
            document="12345678901234",
        )

    def test_client_creation(self):
        self.assertEqual(self.client.name, "Test Client")
        self.assertEqual(str(self.client), "Test Client")


class InvoiceModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser2", password="123")
        self.tenant = Tenant.objects.create(
            name="Test Tenant 2",
            slug="test-tenant-2",
            owner=self.user,
            document="12345678902",
        )
        self.invoice = Invoice.objects.create(
            user=self.user,
            tenant=self.tenant,
            number=1,
            issue_date=date(2026, 6, 23),
            client_name="Client Test",
            gross_value=Decimal("1000.00"),
            deductions=Decimal("100.00"),
            iss_rate=Decimal("5.00"),
            iss_withheld=True,
            pis_rate=Decimal("0.65"),
            cofins_rate=Decimal("3.00"),
            csll_rate=Decimal("1.00"),
            ir_rate=Decimal("1.50"),
            inss_rate=Decimal("0.00")
        )

    def test_invoice_creation(self):
        self.assertEqual(self.invoice.number, 1)
        self.assertEqual(self.invoice.status, Invoice.DRAFT)
        self.assertEqual(self.invoice.number_display, "0001/2026")

    def test_calculation_base(self):
        self.assertEqual(self.invoice.calculation_base, Decimal("900.00"))

    def test_tax_calculations(self):
        self.assertEqual(self.invoice.iss_value, Decimal("45.00"))
        self.assertEqual(self.invoice.pis_value, Decimal("5.85"))
        self.assertEqual(self.invoice.cofins_value, Decimal("27.00"))
        self.assertEqual(self.invoice.csll_value, Decimal("9.00"))
        self.assertEqual(self.invoice.ir_value, Decimal("13.50"))
        self.assertEqual(self.invoice.inss_value, Decimal("0.00"))

    def test_net_value(self):
        self.assertEqual(self.invoice.net_value, Decimal("899.65"))

    def test_next_number(self):
        next_num = Invoice.next_number(self.tenant)
        self.assertEqual(next_num, 2)
