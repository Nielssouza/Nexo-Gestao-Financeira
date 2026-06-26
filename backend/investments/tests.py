from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from investments.models import Investment, InvestmentEntry


class InvestmentApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="investment-api-user",
            password="secret123",
        )
        self.other_user = user_model.objects.create_user(
            username="investment-api-other",
            password="secret123",
        )
        self.tenant = self.user.tenant_memberships.get().tenant
        self.investment = Investment.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Tesouro API",
            investment_type=Investment.InvestmentType.FIXED_INCOME,
            broker="Banco API",
        )
        self.other_investment = Investment.objects.create(
            user=self.other_user,
            name="Outro Investimento API",
            investment_type=Investment.InvestmentType.STOCKS,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_investment_api_create_assigns_user_and_tenant(self):
        response = self.client.post(
            "/api/v1/investments/",
            {
                "name": "Reserva API",
                "investment_type": Investment.InvestmentType.EMERGENCY,
                "broker": "Banco Reserva",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        investment = Investment.objects.get(name="Reserva API")
        self.assertEqual(investment.user, self.user)
        self.assertEqual(investment.tenant, self.tenant)

    def test_investment_api_list_is_limited_to_current_tenant(self):
        response = self.client.get("/api/v1/investments/")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data["results"]}
        self.assertEqual(ids, {self.investment.pk})

    def test_investment_add_entry_api_creates_tenant_scoped_entry(self):
        response = self.client.post(
            f"/api/v1/investments/{self.investment.pk}/add_entry/",
            {
                "entry_type": InvestmentEntry.EntryType.DEPOSIT,
                "amount": "350.00",
                "date": "2026-06-20",
                "description": "Aporte API",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        entry = InvestmentEntry.objects.get(description="Aporte API")
        self.assertEqual(entry.user, self.user)
        self.assertEqual(entry.tenant, self.tenant)
        self.assertEqual(entry.investment, self.investment)
        self.assertEqual(entry.amount, Decimal("350.00"))

    def test_investment_entry_api_rejects_other_tenant_investment(self):
        response = self.client.post(
            "/api/v1/investment-entries/",
            {
                "investment": self.other_investment.pk,
                "entry_type": InvestmentEntry.EntryType.DEPOSIT,
                "amount": "350.00",
                "date": "2026-06-20",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            InvestmentEntry.objects.filter(
                investment=self.other_investment,
                tenant=self.tenant,
            ).exists()
        )

    def test_investment_entry_api_rejects_non_positive_amount(self):
        response = self.client.post(
            f"/api/v1/investments/{self.investment.pk}/add_entry/",
            {
                "entry_type": InvestmentEntry.EntryType.DEPOSIT,
                "amount": "0.00",
                "date": "2026-06-20",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
