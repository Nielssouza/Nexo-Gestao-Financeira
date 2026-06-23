from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

from accounts.models import Account
from common.balance import (
    calculate_account_balance,
    calculate_credit_card_available_limit,
    calculate_monthly_balance,
    calculate_user_balance,
)
from common.months import month_bounds, month_value_to_date, shift_month
from common.security import resolve_safe_redirect_url
from common.tenancy import assign_tenant, resolve_tenant
from tenants.models import TenantMembership
from transactions.models import Transaction


class MonthHelpersTests(SimpleTestCase):
    def test_month_value_to_date_parses_valid_month(self):
        self.assertEqual(month_value_to_date("2026-06"), date(2026, 6, 1))

    def test_month_value_to_date_rejects_invalid_values(self):
        invalid_values = (None, "", "2026", "2026-00", "2026-13", "junho-2026", 202606)

        for value in invalid_values:
            with self.subTest(value=value):
                self.assertIsNone(month_value_to_date(value))

    def test_shift_month_crosses_year_boundaries_in_both_directions(self):
        self.assertEqual(shift_month(date(2026, 12, 15), 1), date(2027, 1, 1))
        self.assertEqual(shift_month(date(2026, 1, 15), -1), date(2025, 12, 1))
        self.assertEqual(shift_month(date(2026, 6, 15), 18), date(2027, 12, 1))

    def test_month_bounds_returns_half_open_month_interval(self):
        self.assertEqual(
            month_bounds(date(2026, 12, 1)),
            (date(2026, 12, 1), date(2027, 1, 1)),
        )


@override_settings(ALLOWED_HOSTS=["nexo.test"])
class SafeRedirectTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_empty_destination_uses_fallback(self):
        request = self.factory.get("/", HTTP_HOST="nexo.test")

        result = resolve_safe_redirect_url(request, "  ", "/dashboard/")

        self.assertEqual(result, "/dashboard/")

    def test_local_destination_keeps_path_and_query_string(self):
        request = self.factory.get("/", HTTP_HOST="nexo.test")

        result = resolve_safe_redirect_url(
            request,
            "/transactions/?month=2026-06",
            "/dashboard/",
        )

        self.assertEqual(result, "/transactions/?month=2026-06")

    def test_external_and_scheme_relative_destinations_are_rejected(self):
        request = self.factory.get("/", HTTP_HOST="nexo.test")

        for destination in ("https://attacker.test/path", "//attacker.test/path"):
            with self.subTest(destination=destination):
                self.assertEqual(
                    resolve_safe_redirect_url(request, destination, "/safe/"),
                    "/safe/",
                )

    def test_secure_request_rejects_plain_http_destination(self):
        request = self.factory.get("/", secure=True, HTTP_HOST="nexo.test")

        result = resolve_safe_redirect_url(
            request,
            "http://nexo.test/transactions/",
            "/safe/",
        )

        self.assertEqual(result, "/safe/")

    def test_replacement_is_applied_before_validation(self):
        request = self.factory.get("/", HTTP_HOST="nexo.test")

        result = resolve_safe_redirect_url(
            request,
            "/old/42/?month=2026-06",
            "/safe/",
            replacements=(("/old/", "/new/"),),
        )

        self.assertEqual(result, "/new/42/?month=2026-06")


class TenancyHelpersTests(SimpleTestCase):
    def test_resolve_tenant_prefers_explicit_tenant(self):
        tenant = object()

        with patch("common.tenancy.ensure_user_has_tenant") as ensure_tenant:
            result = resolve_tenant(tenant=tenant, user=object())

        self.assertIs(result, tenant)
        ensure_tenant.assert_not_called()

    def test_resolve_tenant_without_user_returns_none(self):
        self.assertIsNone(resolve_tenant())

    @patch("common.tenancy.ensure_user_has_tenant")
    def test_assign_tenant_resolves_it_from_instance_user(self, ensure_tenant):
        tenant = object()
        ensure_tenant.return_value = tenant
        user = object()
        instance = SimpleNamespace(tenant=None, tenant_id=None, user=user, user_id=1)

        result = assign_tenant(instance)

        self.assertIs(result, tenant)
        self.assertIs(instance.tenant, tenant)
        ensure_tenant.assert_called_once_with(user)

    @patch("common.tenancy.ensure_user_has_tenant")
    def test_assign_tenant_preserves_existing_tenant(self, ensure_tenant):
        tenant = object()
        instance = SimpleNamespace(tenant=tenant, tenant_id=10, user=object(), user_id=1)

        result = assign_tenant(instance)

        self.assertIs(result, tenant)
        ensure_tenant.assert_not_called()


class BalanceFunctionsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="common-balance-user",
            password="test-password-123",
        )
        self.tenant = TenantMembership.objects.get(
            user=self.user,
            is_default=True,
        ).tenant
        self.primary = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Conta principal",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("1000.00"),
        )
        self.secondary = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Conta secundaria",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("200.00"),
        )

    def create_transaction(self, **overrides):
        values = {
            "user": self.user,
            "tenant": self.tenant,
            "transaction_type": Transaction.TransactionType.INCOME,
            "amount": Decimal("100.00"),
            "date": date(2026, 6, 10),
            "account": self.primary,
            "description": "Teste de saldo",
            "is_cleared": True,
            "recurrence_type": Transaction.RecurrenceType.ONCE,
        }
        values.update(overrides)
        return Transaction.objects.create(**values)

    def test_account_balance_respects_status_ignored_flag_and_cutoff_date(self):
        self.create_transaction(amount=Decimal("300.00"))
        self.create_transaction(
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("80.00"),
        )
        self.create_transaction(amount=Decimal("500.00"), is_cleared=False)
        self.create_transaction(amount=Decimal("600.00"), is_ignored=True)
        self.create_transaction(amount=Decimal("700.00"), date=date(2026, 7, 1))

        balance = calculate_account_balance(self.primary, cutoff_date=date(2026, 6, 30))

        self.assertEqual(balance, Decimal("1220.00"))

    def test_user_balance_counts_transfer_once_across_tracked_accounts(self):
        self.create_transaction(amount=Decimal("300.00"))
        self.create_transaction(
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("100.00"),
        )
        self.create_transaction(
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount=Decimal("250.00"),
            destination_account=self.secondary,
        )

        total = calculate_user_balance(
            self.user,
            date(2026, 6, 30),
            tenant=self.tenant,
        )

        self.assertEqual(total, Decimal("1400.00"))
        self.assertEqual(
            calculate_account_balance(self.primary, date(2026, 6, 30)),
            Decimal("950.00"),
        )
        self.assertEqual(
            calculate_account_balance(self.secondary, date(2026, 6, 30)),
            Decimal("450.00"),
        )

    def test_monthly_balance_applies_account_filter_and_transfer_direction(self):
        self.create_transaction(amount=Decimal("300.00"))
        self.create_transaction(
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("100.00"),
        )
        self.create_transaction(
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount=Decimal("250.00"),
            destination_account=self.secondary,
        )
        self.create_transaction(amount=Decimal("900.00"), date=date(2026, 5, 31))
        self.create_transaction(amount=Decimal("800.00"), is_ignored=True)

        primary_total = calculate_monthly_balance(
            self.user,
            date(2026, 6, 1),
            account=self.primary,
            tenant=self.tenant,
        )
        secondary_total = calculate_monthly_balance(
            self.user,
            date(2026, 6, 1),
            account=self.secondary,
            tenant=self.tenant,
        )
        consolidated_total = calculate_monthly_balance(
            self.user,
            date(2026, 6, 1),
            tenant=self.tenant,
        )

        self.assertEqual(primary_total, Decimal("-50.00"))
        self.assertEqual(secondary_total, Decimal("250.00"))
        self.assertEqual(consolidated_total, Decimal("200.00"))

    def test_credit_card_available_limit_uses_month_and_cleared_expenses(self):
        card = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Cartao",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        self.create_transaction(account=card, amount=Decimal("1000.00"))
        self.create_transaction(
            account=card,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("250.00"),
        )
        self.create_transaction(
            account=card,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("100.00"),
            is_cleared=False,
        )
        self.create_transaction(
            account=card,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("50.00"),
            is_ignored=True,
        )
        self.create_transaction(
            account=card,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("300.00"),
            date=date(2026, 5, 31),
        )

        available = calculate_credit_card_available_limit(
            self.tenant,
            date(2026, 6, 1),
        )

        self.assertEqual(available, Decimal("750.00"))

    def test_credit_card_available_limit_uses_card_credit_limit_when_present(self):
        card = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Cartao com limite",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            credit_limit=Decimal("500.00"),
            include_in_balance=False,
        )
        self.create_transaction(
            account=card,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("125.00"),
        )
        self.create_transaction(
            account=card,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("50.00"),
            is_cleared=False,
        )

        available = calculate_credit_card_available_limit(
            self.tenant,
            date(2026, 6, 1),
        )

        self.assertEqual(available, Decimal("375.00"))

    def test_user_balance_includes_cleared_card_account_balance(self):
        card = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Cartao saldo",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        self.create_transaction(
            account=card,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
        )

        total = calculate_user_balance(
            self.user,
            date(2026, 6, 30),
            tenant=self.tenant,
        )

        self.assertEqual(total, Decimal("1118.32"))
