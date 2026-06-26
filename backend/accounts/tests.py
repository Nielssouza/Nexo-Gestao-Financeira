from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account, CardMonthlyLimit
from categories.models import Category
from transactions.models import Transaction


class AccountBalanceTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="account-balance-user",
            password="secret123",
        )
        self.client.force_login(self.user)
        self.bank_account = Account.objects.create(
            user=self.user,
            name="Banco",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("1000.00"),
        )
        self.card_account = Account.objects.create(
            user=self.user,
            name="Cartao de Credito",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        self.expense_category = Category.objects.create(
            user=self.user,
            name="Cartao",
            category_type=Category.CategoryType.EXPENSE,
        )

    def test_card_transactions_do_not_change_account_balances(self):
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("600.00"),
            date=date(2026, 3, 10),
            account=self.card_account,
            category=self.expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        self.assertEqual(self.bank_account.balance, Decimal("1000.00"))
        self.assertEqual(self.card_account.balance, Decimal("0.00"))

    def test_card_account_balance_updates_with_cleared_status(self):
        real_card_account = Account.objects.create(
            user=self.user,
            name="Cartao real",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        card_expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 3, 10),
            account=real_card_account,
            category=self.expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        self.assertEqual(real_card_account.balance, Decimal("-81.68"))

        card_expense.is_cleared = False
        card_expense.save(update_fields=["is_cleared"])

        self.assertEqual(real_card_account.balance, Decimal("0.00"))

    def test_account_list_shows_card_account_balance(self):
        real_card_account = Account.objects.create(
            user=self.user,
            name="Cartao real",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 3, 10),
            account=real_card_account,
            category=self.expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        response = self.client.get(reverse("accounts:list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Cartao real")
        self.assertContains(response, "Saldo: -R$ 81,68")

    def test_transfer_to_card_reduces_only_source_account_balance(self):
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount=Decimal("400.00"),
            date=date(2026, 3, 15),
            account=self.bank_account,
            destination_account=self.card_account,
            description="Pagamento da fatura",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        self.assertEqual(self.bank_account.balance, Decimal("600.00"))
        self.assertEqual(self.card_account.balance, Decimal("0.00"))

    def test_account_form_exposes_include_in_balance_option(self):
        response = self.client.get(reverse("accounts:update", args=[self.bank_account.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Considerar no saldo")

    def test_create_account_assigns_logged_in_user(self):
        response = self.client.post(
            reverse("accounts:create"),
            {
                "name": "Reserva",
                "account_type": Account.AccountType.CASH,
                "initial_balance": "250.00",
                "include_in_balance": "on",
                "is_active": "on",
            },
        )

        self.assertRedirects(response, reverse("accounts:list"))
        account = Account.objects.get(name="Reserva")
        self.assertEqual(account.user, self.user)
        self.assertIsNotNone(account.tenant)


class AccountApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="account-api-user",
            password="secret123",
        )
        self.other_user = user_model.objects.create_user(
            username="account-api-other",
            password="secret123",
        )
        self.tenant = self.user.tenant_memberships.get().tenant
        self.account = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Cartao API",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            credit_limit=Decimal("1000.00"),
            include_in_balance=False,
        )
        self.other_account = Account.objects.create(
            user=self.other_user,
            name="Cartao Outro",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_account_api_create_assigns_user_and_tenant(self):
        response = self.client.post(
            "/api/v1/accounts/",
            {
                "name": "Conta API",
                "account_type": Account.AccountType.BANK,
                "initial_balance": "150.00",
                "include_in_balance": True,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        account = Account.objects.get(name="Conta API")
        self.assertEqual(account.user, self.user)
        self.assertEqual(account.tenant, self.tenant)

    def test_card_limit_api_upserts_monthly_limit(self):
        payload = {
            "account": self.account.pk,
            "year": 2026,
            "month": 6,
            "amount": "850.00",
        }

        created = self.client.post("/api/v1/card-limits/", payload, format="json")
        updated = self.client.post(
            "/api/v1/card-limits/",
            {**payload, "amount": "900.00"},
            format="json",
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(updated.status_code, 200)
        limit = CardMonthlyLimit.objects.get(account=self.account, year=2026, month=6)
        self.assertEqual(limit.amount, Decimal("900.00"))
        self.assertEqual(limit.tenant, self.tenant)

    def test_card_limit_api_rejects_account_from_other_tenant(self):
        response = self.client.post(
            "/api/v1/card-limits/",
            {
                "account": self.other_account.pk,
                "year": 2026,
                "month": 6,
                "amount": "850.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertFalse(CardMonthlyLimit.objects.filter(account=self.other_account).exists())

    def test_card_limit_api_rejects_invalid_month_and_negative_amount(self):
        invalid_month = self.client.post(
            "/api/v1/card-limits/",
            {
                "account": self.account.pk,
                "year": 2026,
                "month": 13,
                "amount": "850.00",
            },
            format="json",
        )
        negative_amount = self.client.post(
            "/api/v1/card-limits/",
            {
                "account": self.account.pk,
                "year": 2026,
                "month": 6,
                "amount": "-1.00",
            },
            format="json",
        )

        self.assertEqual(invalid_month.status_code, 400)
        self.assertEqual(negative_amount.status_code, 400)
