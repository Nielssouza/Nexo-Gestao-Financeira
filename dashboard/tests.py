from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from accounts.models import Account
from categories.models import Category
from transactions.models import Transaction


class DashboardChartsMonthScopeTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="tester",
            password="secret123",
        )
        self.client.force_login(self.user)

        self.account = Account.objects.create(
            user=self.user,
            name="Conta Principal",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
        )
        self.category = Category.objects.create(
            user=self.user,
            name="Aluguel",
            category_type=Category.CategoryType.EXPENSE,
        )

    def test_charts_ranking_keeps_selected_month_scope(self):
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("1000.00"),
            date=date(2026, 2, 10),
            account=self.account,
            category=self.category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response_feb = self.client.get(
            reverse("dashboard:charts"),
            {"month": "2026-02"},
        )
        self.assertEqual(response_feb.status_code, 200)
        self.assertEqual(len(response_feb.context["charts_items"]), 1)
        self.assertEqual(response_feb.context["charts_items"][0]["name"], "Aluguel")

        response_jan = self.client.get(
            reverse("dashboard:charts"),
            {"month": "2026-01"},
        )
        self.assertEqual(response_jan.status_code, 200)
        self.assertEqual(response_jan.context["charts_items"], [])
        self.assertNotEqual(response_jan.context["ranking_scope_label"], "Geral")
        self.assertContains(response_jan, "Sem despesas cadastradas para montar ranking.")

    def test_charts_month_navigation_preserves_selected_mode(self):
        response = self.client.get(
            reverse("dashboard:charts"),
            {"month": "2026-02", "mode": "trend"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["selected_chart_mode"], "trend")
        self.assertIn("mode=trend", response.context["prev_month_query"])
        self.assertIn("mode=trend", response.context["next_month_query"])
        self.assertContains(response, 'setMode("trend", false);')


    def test_home_total_balance_ignores_pending_expense(self):
        income_category = Category.objects.create(
            user=self.user,
            name="Salario2",
            category_type=Category.CategoryType.INCOME,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=Decimal("8000.00"),
            date=date(2026, 3, 5),
            account=self.account,
            category=income_category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("1000.00"),
            date=date(2026, 3, 13),
            account=self.account,
            category=self.category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=False,
        )

        response = self.client.get(reverse("dashboard:home"), {"month": "2026-03"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["total_balance"], Decimal("8000.00"))

    def test_home_total_balance_respects_selected_month_cutoff(self):
        income_category = Category.objects.create(
            user=self.user,
            name="Salario",
            category_type=Category.CategoryType.INCOME,
        )
        march_income = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=Decimal("7000.00"),
            date=date(2026, 3, 1),
            account=self.account,
            category=income_category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        response = self.client.get(reverse("dashboard:home"), {"month": "2026-01"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["total_balance"], Decimal("0.00"))
        self.assertTrue(Transaction.objects.filter(pk=march_income.pk, is_cleared=True).exists())

    def test_home_total_balance_excludes_card_transactions_and_applies_card_payment(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao de Credito",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("600.00"),
            date=date(2026, 3, 10),
            account=card_account,
            category=self.category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount=Decimal("400.00"),
            date=date(2026, 3, 15),
            account=self.account,
            destination_account=card_account,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )
        self.account.initial_balance = Decimal("1000.00")
        self.account.save(update_fields=["initial_balance"])

        response = self.client.get(reverse("dashboard:home"), {"month": "2026-03"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["total_balance"], Decimal("600.00"))

    def test_home_total_balance_applies_cleared_card_expense(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao saldo",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        self.account.initial_balance = Decimal("1000.00")
        self.account.save(update_fields=["initial_balance"])

        card_expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 3, 16),
            account=card_account,
            category=self.category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        cleared_response = self.client.get(reverse("dashboard:home"), {"month": "2026-03"})
        self.assertEqual(cleared_response.status_code, 200)
        self.assertEqual(cleared_response.context["total_balance"], Decimal("918.32"))

        card_expense.is_cleared = False
        card_expense.save(update_fields=["is_cleared"])

        pending_response = self.client.get(reverse("dashboard:home"), {"month": "2026-03"})
        self.assertEqual(pending_response.status_code, 200)
        self.assertEqual(pending_response.context["total_balance"], Decimal("1000.00"))

    def test_home_card_limit_uses_card_account_balance(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao limite",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            credit_limit=Decimal("281.68"),
            include_in_balance=False,
        )
        card_expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 3, 16),
            account=card_account,
            category=self.category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        cleared_response = self.client.get(reverse("dashboard:home"), {"month": "2026-03"})
        self.assertEqual(cleared_response.status_code, 200)
        self.assertEqual(cleared_response.context["credit_card_limit"], Decimal("200.00"))

        card_expense.is_cleared = False
        card_expense.save(update_fields=["is_cleared"])

        pending_response = self.client.get(reverse("dashboard:home"), {"month": "2026-03"})
        self.assertEqual(pending_response.status_code, 200)
        self.assertEqual(pending_response.context["credit_card_limit"], Decimal("281.68"))

    def test_home_shows_selected_month_credit_card_expense_total(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao Controle",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            credit_limit=Decimal("500.50"),
            include_in_balance=False,
        )
        bank_category = Category.objects.create(
            user=self.user,
            name="Mercado",
            category_type=Category.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("120.00"),
            date=date(2026, 3, 8),
            account=card_account,
            category=bank_category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("80.50"),
            date=date(2026, 3, 12),
            account=card_account,
            category=bank_category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("70.00"),
            date=date(2026, 3, 13),
            account=card_account,
            category=bank_category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("999.00"),
            date=date(2026, 2, 12),
            account=card_account,
            category=bank_category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("40.00"),
            date=date(2026, 3, 14),
            account=self.account,
            category=bank_category,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.get(reverse("dashboard:home"), {"month": "2026-03"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["credit_card_expense_total"], Decimal("200.50"))
        self.assertEqual(response.context["credit_card_open_total"], Decimal("200.50"))
        self.assertEqual(response.context["credit_card_month_total"], Decimal("270.50"))
        self.assertEqual(response.context["credit_card_expense_count"], 2)
        self.assertEqual(response.context["credit_card_month_count"], 3)
        self.assertEqual(response.context["credit_card_limit"], Decimal("430.50"))
        self.assertEqual(
            response.context["consolidated_balance"],
            response.context["total_balance"],
        )
        self.assertContains(response, "Cartão aberto")
        self.assertContains(response, "Total cartão")
        self.assertContains(response, "Limite do cartão")
        self.assertContains(response, "Balanço consolidado")
        self.assertContains(response, "R$ 200,50")
        self.assertContains(response, "R$ 270,50")
        self.assertContains(response, "R$ 430,50")

    def test_home_due_notifications_keep_selected_month_scope(self):
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("91.14"),
            date=date(2026, 7, 1),
            account=self.account,
            category=self.category,
            description="Conta julho",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=False,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("47.76"),
            date=date(2026, 8, 6),
            account=self.account,
            category=self.category,
            description="Conta agosto",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=False,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("35.00"),
            date=date(2025, 7, 10),
            account=self.account,
            category=self.category,
            description="Conta julho outro ano",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=False,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("22.00"),
            date=date(2026, 7, 12),
            account=self.account,
            category=self.category,
            description="Conta julho baixada",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        response = self.client.get(reverse("dashboard:home"), {"month": "2026-07"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["due_notifications_count"], 1)
        self.assertEqual(len(response.context["due_notifications"]), 1)
        self.assertEqual(response.context["due_notifications"][0].description, "Conta julho")
        self.assertContains(response, "/transactions/?month=2026-07")
        self.assertContains(response, "Conta julho")
        self.assertNotContains(response, "Conta agosto")
        self.assertNotContains(response, "Conta julho outro ano")

class DashboardPostLoginLoaderTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="login-loader-user",
            email="login-loader-user@example.com",
            password="strong-pass-123",
        )

    def test_post_login_loader_flag_is_consumed_once(self):
        response = self.client.post(
            reverse("users:login"),
            {"username": "login-loader-user@example.com", "password": "strong-pass-123"},
            follow=False,
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers.get("Location"), reverse("dashboard:home"))

        first_home = self.client.get(reverse("dashboard:home"))
        self.assertEqual(first_home.status_code, 200)
        self.assertTrue(first_home.context["show_post_login_loader"])

        second_home = self.client.get(reverse("dashboard:home"))
        self.assertEqual(second_home.status_code, 200)
        self.assertFalse(second_home.context["show_post_login_loader"])


class DashboardPublicLandingTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="landing-user",
            password="landing-pass-123",
        )

    def test_home_renders_public_landing_for_anonymous_user(self):
        response = self.client.get(reverse("dashboard:home"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "dashboard/landing.html")
        self.assertContains(response, "Controle contas, metas e compras em um fluxo simples.")
        self.assertContains(response, reverse("users:login"))

    def test_home_keeps_dashboard_for_authenticated_user(self):
        self.client.force_login(self.user)

        response = self.client.get(reverse("dashboard:home"))

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "dashboard/home.html")
        self.assertNotContains(response, "Financeiro pessoal, sem planilha")

