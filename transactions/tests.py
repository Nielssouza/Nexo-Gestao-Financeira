from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from accounts.models import Account
from categories.models import Category
from transactions.models import ClosedMonth, Transaction


class TransactionScopeAndMonthLockTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="scope-user",
            password="scope-pass-123",
        )
        self.client.login(username="scope-user", password="scope-pass-123")

        self.account = Account.objects.create(
            user=self.user,
            name="Banco",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            is_active=True,
        )
        self.category = Category.objects.create(
            user=self.user,
            name="Salario",
            category_type=Category.CategoryType.INCOME,
        )

        self.jan = self._create_tx(date(2026, 1, 10))
        self.feb = self._create_tx(date(2026, 2, 10))
        self.mar = self._create_tx(date(2026, 3, 10))

    def _create_tx(self, tx_date):
        return Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=Decimal("7000.00"),
            date=tx_date,
            account=self.account,
            category=self.category,
            description="Salarios",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.FIXED,
            recurrence_interval=1,
        )

    def _close_month(self, year, month):
        ClosedMonth.objects.create(user=self.user, year=year, month=month, is_closed=True)

    def _build_edit_payload(self, **overrides):
        data = {
            "transaction_type": Transaction.TransactionType.INCOME,
            "amount": "R$ 7.000,00",
            "date": self.feb.date.isoformat(),
            "is_cleared": "",
            "account": str(self.account.pk),
            "destination_account": "",
            "category": str(self.category.pk),
            "description": "Salarios",
            "recurrence_type": Transaction.RecurrenceType.FIXED,
            "installment_count": "",
            "recurrence_interval": "1",
            "recurrence_interval_unit": Transaction.IntervalUnit.MONTH,
            "unlock_password": "",
        }
        data.update(overrides)
        return data

    def _build_create_payload(self, **overrides):
        data = {
            "transaction_type": Transaction.TransactionType.INCOME,
            "amount": "R$ 1.000,00",
            "date": "2026-02-05",
            "is_cleared": "",
            "account": str(self.account.pk),
            "destination_account": "",
            "category": str(self.category.pk),
            "description": "Extra",
            "recurrence_type": Transaction.RecurrenceType.FIXED,
            "installment_count": "",
            "recurrence_interval": "1",
            "recurrence_interval_unit": Transaction.IntervalUnit.MONTH,
            "unlock_password": "",
        }
        data.update(overrides)
        return data

    def test_future_transaction_marked_as_cleared_is_kept_cleared(self):
        future_tx = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("300.00"),
            date=date(2026, 4, 10),
            account=self.account,
            category=Category.objects.create(
                user=self.user,
                name="Conta futura",
                category_type=Category.CategoryType.EXPENSE,
            ),
            description="Despesa futura",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        future_tx.refresh_from_db()
        self.assertTrue(future_tx.is_cleared)
    def test_update_scope_current_changes_only_selected_transaction(self):
        payload = self._build_edit_payload(amount="R$ 7.200,00", scope="current")

        response = self.client.post(
            reverse("transactions:update", args=[self.feb.pk]),
            data=payload,
        )

        self.assertEqual(response.status_code, 302)
        self.jan.refresh_from_db()
        self.feb.refresh_from_db()
        self.mar.refresh_from_db()

        self.assertEqual(self.jan.amount, Decimal("7000.00"))
        self.assertEqual(self.feb.amount, Decimal("7200.00"))
        self.assertEqual(self.mar.amount, Decimal("7000.00"))

    def test_update_scope_all_changes_all_pending_transactions_in_series(self):
        self.jan.is_cleared = True
        self.jan.save(update_fields=["is_cleared"])

        payload = self._build_edit_payload(description="Salario principal", scope="all")

        response = self.client.post(
            reverse("transactions:update", args=[self.feb.pk]),
            data=payload,
        )

        self.assertEqual(response.status_code, 302)
        self.jan.refresh_from_db()
        self.feb.refresh_from_db()
        self.mar.refresh_from_db()

        self.assertEqual(self.jan.description, "Salarios")  # baixada nao muda
        self.assertEqual(self.feb.description, "Salario principal")
        self.assertEqual(self.mar.description, "Salario principal")


    def test_update_scope_all_applies_only_forward_occurrences(self):
        payload = self._build_edit_payload(
            description="Somente futuro",
            scope="all",
        )

        response = self.client.post(
            reverse("transactions:update", args=[self.feb.pk]),
            data=payload,
        )

        self.assertEqual(response.status_code, 302)
        self.jan.refresh_from_db()
        self.feb.refresh_from_db()
        self.mar.refresh_from_db()

        self.assertEqual(self.jan.description, "Salarios")
        self.assertEqual(self.feb.description, "Somente futuro")
        self.assertEqual(self.mar.description, "Somente futuro")

    def test_update_scope_all_does_not_propagate_cleared_flag(self):
        payload = self._build_edit_payload(
            description="Ajuste recorrencia",
            scope="all",
            is_cleared="on",
        )

        response = self.client.post(
            reverse("transactions:update", args=[self.feb.pk]),
            data=payload,
        )

        self.assertEqual(response.status_code, 302)
        self.feb.refresh_from_db()
        self.mar.refresh_from_db()

        self.assertTrue(self.feb.is_cleared)
        self.assertFalse(self.mar.is_cleared)
        self.assertEqual(self.mar.description, "Ajuste recorrencia")

    def test_update_closed_month_allows_change_without_password(self):
        self._close_month(2026, 2)
        payload = self._build_edit_payload(description="Novo texto", scope="current")

        response = self.client.post(
            reverse("transactions:update", args=[self.feb.pk]),
            data=payload,
        )

        self.assertEqual(response.status_code, 302)
        self.feb.refresh_from_db()
        self.assertEqual(self.feb.description, "Novo texto")

    def test_update_closed_month_with_password_allows_change(self):
        self._close_month(2026, 2)
        payload = self._build_edit_payload(
            description="Novo texto",
            scope="current",
            unlock_password="scope-pass-123",
        )

        response = self.client.post(
            reverse("transactions:update", args=[self.feb.pk]),
            data=payload,
        )

        self.assertEqual(response.status_code, 302)
        self.feb.refresh_from_db()
        self.assertEqual(self.feb.description, "Novo texto")

    def test_delete_scope_current_removes_only_selected_transaction(self):
        response = self.client.post(
            reverse("transactions:delete", args=[self.feb.pk]),
            data={"scope": "current", "unlock_password": ""},
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(Transaction.objects.filter(pk=self.jan.pk).exists())
        self.assertFalse(Transaction.objects.filter(pk=self.feb.pk).exists())
        self.assertTrue(Transaction.objects.filter(pk=self.mar.pk).exists())


    def test_delete_preserves_month_in_redirect(self):
        response = self.client.post(
            reverse("transactions:delete", args=[self.feb.pk]),
            data={
                "scope": "current",
                "unlock_password": "",
                "next": "/transactions/?month=2026-02",
            },
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/transactions/?month=2026-02")

    def test_delete_scope_all_removes_all_pending_transactions_in_series(self):
        self.jan.is_cleared = True
        self.jan.save(update_fields=['is_cleared'])
        response = self.client.post(
            reverse("transactions:delete", args=[self.feb.pk]),
            data={"scope": "all", "unlock_password": ""},
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(Transaction.objects.filter(pk=self.jan.pk).exists())  # baixada permanece
        self.assertFalse(Transaction.objects.filter(pk=self.feb.pk).exists())
        self.assertFalse(Transaction.objects.filter(pk=self.mar.pk).exists())

    def test_delete_closed_month_allows_deletion_without_password(self):
        self._close_month(2026, 2)

        response = self.client.post(
            reverse("transactions:delete", args=[self.feb.pk]),
            data={"scope": "current", "unlock_password": ""},
        )

        self.assertEqual(response.status_code, 302)
        self.assertFalse(Transaction.objects.filter(pk=self.feb.pk).exists())

    def test_delete_cleared_transaction_is_blocked(self):
        self.feb.is_cleared = True
        self.feb.save(update_fields=["is_cleared"])

        response = self.client.post(
            reverse("transactions:delete", args=[self.feb.pk]),
            data={"scope": "current", "unlock_password": "scope-pass-123"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Transaction.objects.filter(pk=self.feb.pk).exists())

    def test_create_closed_month_allows_creation_without_password(self):
        self._close_month(2026, 2)

        response = self.client.post(
            reverse("transactions:create"),
            data=self._build_create_payload(),
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            Transaction.objects.filter(
                user=self.user,
                date=date(2026, 2, 5),
                description="Extra",
            ).exists()
        )

    def test_create_transaction_assigns_logged_in_user(self):
        response = self.client.post(
            reverse("transactions:create"),
            data=self._build_create_payload(
                description="Bonus",
                recurrence_type=Transaction.RecurrenceType.ONCE,
            ),
        )

        self.assertRedirects(response, reverse("transactions:statement"))
        transaction = Transaction.objects.get(description="Bonus")
        self.assertEqual(transaction.user, self.user)
        self.assertEqual(transaction.tenant, self.account.tenant)

    def test_pending_expense_uses_cleared_style_only_when_baixada(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Aluguel",
            category_type=Category.CategoryType.EXPENSE,
        )

        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("50.00"),
            date=date(2026, 2, 15),
            account=self.account,
            category=expense_category,
            description="Despesa pendente",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("70.00"),
            date=date(2026, 2, 16),
            account=self.account,
            category=expense_category,
            description="Despesa baixada",
            is_cleared=True,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-02"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="txn-amount txn-amount-expense">R$ 50,00</p>', html=False)
        self.assertContains(response, 'class="txn-amount txn-amount-expense txn-amount-cleared">R$ 70,00</p>', html=False)

    def test_generate_future_occurrences_respects_day_unit(self):
        tx = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=Decimal("10.00"),
            date=date(2026, 2, 1),
            account=self.account,
            category=self.category,
            description="Fixa em dias",
            recurrence_type=Transaction.RecurrenceType.FIXED,
            recurrence_interval=10,
            recurrence_interval_unit=Transaction.IntervalUnit.DAY,
            is_cleared=False,
        )

        created_count = tx.generate_future_occurrences()

        self.assertGreater(created_count, 0)
        self.assertTrue(
            Transaction.objects.filter(
                user=self.user,
                description="Fixa em dias",
                date=date(2026, 2, 11),
            ).exists()
        )


    def test_installment_transactions_get_sequential_numbers(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Curso",
            category_type=Category.CategoryType.EXPENSE,
        )
        tx = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("100.00"),
            date=date(2026, 2, 20),
            account=self.account,
            category=expense_category,
            description="Curso online",
            recurrence_type=Transaction.RecurrenceType.INSTALLMENT,
            recurrence_interval_unit=Transaction.IntervalUnit.MONTH,
            installment_count=3,
            is_cleared=False,
        )

        created_count = tx.generate_future_occurrences()

        self.assertEqual(created_count, 2)
        installments = list(
            Transaction.objects.filter(
                user=self.user,
                description="Curso online",
            ).order_by("date")
        )
        self.assertEqual([item.installment_number for item in installments], [1, 2, 3])

    def test_statement_shows_installment_fraction_in_title(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Parcelado",
            category_type=Category.CategoryType.EXPENSE,
        )
        tx = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("150.00"),
            date=date(2026, 2, 21),
            account=self.account,
            category=expense_category,
            description="Notebook",
            recurrence_type=Transaction.RecurrenceType.INSTALLMENT,
            recurrence_interval_unit=Transaction.IntervalUnit.MONTH,
            installment_count=3,
            is_cleared=False,
        )
        tx.generate_future_occurrences()

        feb_response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})
        mar_response = self.client.get(reverse("transactions:statement"), {"month": "2026-03"})

        self.assertEqual(feb_response.status_code, 200)
        self.assertEqual(mar_response.status_code, 200)
        self.assertContains(feb_response, "Notebook (1/3)")
        self.assertContains(mar_response, "Notebook (2/3)")

    def test_statement_current_balance_respects_selected_month_cutoff(self):
        self.mar.is_cleared = True
        self.mar.save(update_fields=["is_cleared"])

        response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-01"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["current_balance"], Decimal("0.00"))



    def test_statement_current_balance_ignores_pending_expense(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Conta pendente",
            category_type=Category.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("500.00"),
            date=date(2026, 3, 10),
            account=self.account,
            category=expense_category,
            description="Pendente",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=False,
        )

        with patch("transactions.models.timezone.localdate", return_value=date(2026, 3, 31)):
            self.mar.is_cleared = True
            self.mar.save(update_fields=["is_cleared"])

        with patch("transactions.views.timezone.localdate", return_value=date(2026, 3, 31)):
            response = self.client.get(
                reverse("transactions:statement"),
                {"month": "2026-03"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["current_balance"], Decimal("7000.00"))

    def test_statement_current_balance_excludes_card_transactions_and_applies_card_payment(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao de Credito",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            is_active=True,
            include_in_balance=False,
        )
        expense_category = Category.objects.create(
            user=self.user,
            name="Cartao credito",
            category_type=Category.CategoryType.EXPENSE,
        )
        self.account.initial_balance = Decimal("1000.00")
        self.account.save(update_fields=["initial_balance"])

        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("600.00"),
            date=date(2026, 3, 10),
            account=card_account,
            category=expense_category,
            description="Compra no cartao",
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
            description="Pagamento da fatura",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-03"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["current_balance"], Decimal("600.00"))

    def test_statement_current_balance_applies_cleared_card_expense(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao saldo",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            is_active=True,
            include_in_balance=False,
        )
        expense_category = Category.objects.create(
            user=self.user,
            name="Despesa cartao saldo",
            category_type=Category.CategoryType.EXPENSE,
        )
        self.account.initial_balance = Decimal("1000.00")
        self.account.save(update_fields=["initial_balance"])

        card_expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 2, 16),
            account=card_account,
            category=expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        cleared_response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-02"},
        )
        self.assertEqual(cleared_response.status_code, 200)
        self.assertEqual(cleared_response.context["current_balance"], Decimal("918.32"))

        card_expense.is_cleared = False
        card_expense.save(update_fields=["is_cleared"])

        pending_response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-02"},
        )
        self.assertEqual(pending_response.status_code, 200)
        self.assertEqual(pending_response.context["current_balance"], Decimal("1000.00"))

    def test_statement_card_limit_uses_card_account_balance(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao limite",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            credit_limit=Decimal("281.68"),
            is_active=True,
            include_in_balance=False,
        )
        expense_category = Category.objects.create(
            user=self.user,
            name="Despesa cartao limite",
            category_type=Category.CategoryType.EXPENSE,
        )
        card_expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 2, 16),
            account=card_account,
            category=expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        cleared_response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-02"},
        )
        self.assertEqual(cleared_response.status_code, 200)
        self.assertEqual(cleared_response.context["credit_card_limit"], Decimal("200.00"))

        card_expense.is_cleared = False
        card_expense.save(update_fields=["is_cleared"])

        pending_response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-02"},
        )
        self.assertEqual(pending_response.status_code, 200)
        self.assertEqual(pending_response.context["credit_card_limit"], Decimal("281.68"))

    def test_statement_shows_ignore_action_for_income(self):
        response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, reverse("transactions:toggle-ignored", args=[self.feb.pk]))
        self.assertContains(response, "Ignorar")


    def test_statement_marks_cleared_income_with_strike_class(self):
        self.feb.is_cleared = True
        self.feb.save(update_fields=["is_cleared"])

        response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "txn-amount txn-amount-income txn-amount-cleared")

    def test_toggle_ignored_income_is_allowed(self):
        self.feb.is_cleared = True
        self.feb.save(update_fields=["is_cleared"])

        response = self.client.post(
            reverse("transactions:toggle-ignored", args=[self.feb.pk]),
            data={"next": "/transactions/?month=2026-02"},
        )

        self.assertEqual(response.status_code, 302)
        self.feb.refresh_from_db()
        self.assertTrue(self.feb.is_ignored)
        self.assertFalse(self.feb.is_cleared)

    def test_monthly_balance_ignores_cleared_flag(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Internet",
            category_type=Category.CategoryType.EXPENSE,
        )
        expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("500.00"),
            date=date(2026, 2, 12),
            account=self.account,
            category=expense_category,
            description="Internet",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        before_response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})
        self.assertEqual(before_response.status_code, 200)
        self.assertEqual(before_response.context["monthly_balance"], Decimal("6500.00"))

        expense.is_cleared = True
        expense.save(update_fields=["is_cleared"])

        self.feb.is_cleared = True
        self.feb.save(update_fields=["is_cleared"])

        after_response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})
        self.assertEqual(after_response.status_code, 200)
        self.assertEqual(after_response.context["monthly_balance"], Decimal("6500.00"))

    def test_monthly_balance_excludes_card_transactions_and_applies_card_payment(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao mensal",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            is_active=True,
            include_in_balance=False,
        )
        expense_category = Category.objects.create(
            user=self.user,
            name="Cartao mensal",
            category_type=Category.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=Decimal("1000.00"),
            date=date(2026, 2, 8),
            account=self.account,
            category=self.category,
            description="Receita",
            is_cleared=True,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("600.00"),
            date=date(2026, 2, 10),
            account=card_account,
            category=expense_category,
            description="Compra no cartao",
            is_cleared=True,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount=Decimal("400.00"),
            date=date(2026, 2, 12),
            account=self.account,
            destination_account=card_account,
            description="Pagamento da fatura",
            is_cleared=True,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["monthly_balance"], Decimal("7600.00"))

    def test_monthly_balance_for_bank_account_filter_includes_transfer_to_card(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao filtro",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            is_active=True,
            include_in_balance=False,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount=Decimal("400.00"),
            date=date(2026, 2, 12),
            account=self.account,
            destination_account=card_account,
            description="Pagamento da fatura",
            is_cleared=True,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-02", "account": self.account.pk},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["monthly_balance"], Decimal("6600.00"))

    def test_monthly_balance_for_card_account_filter_is_zero(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao filtrado",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            is_active=True,
            include_in_balance=False,
        )
        expense_category = Category.objects.create(
            user=self.user,
            name="Despesa cartao",
            category_type=Category.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("600.00"),
            date=date(2026, 2, 10),
            account=card_account,
            category=expense_category,
            description="Compra no cartao",
            is_cleared=True,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.get(
            reverse("transactions:statement"),
            {"month": "2026-02", "account": card_account.pk},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["monthly_balance"], Decimal("0.00"))

    def test_statement_balance_shows_selected_month_credit_card_expense_total(self):
        card_account = Account.objects.create(
            user=self.user,
            name="Cartao extrato",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            credit_limit=Decimal("1000.05"),
            is_active=True,
            include_in_balance=False,
        )
        expense_category = Category.objects.create(
            user=self.user,
            name="Cartao extrato",
            category_type=Category.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("750.05"),
            date=date(2026, 2, 10),
            account=card_account,
            category=expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("120.00"),
            date=date(2026, 2, 11),
            account=card_account,
            category=expense_category,
            description="Compra baixada",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("99.00"),
            date=date(2026, 1, 10),
            account=card_account,
            category=expense_category,
            description="Compra fora do mes",
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("50.00"),
            date=date(2026, 2, 12),
            account=self.account,
            category=expense_category,
            description="Compra no banco",
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["credit_card_expense_total"], Decimal("750.05"))
        self.assertEqual(response.context["credit_card_open_total"], Decimal("750.05"))
        self.assertEqual(response.context["credit_card_month_total"], Decimal("870.05"))
        self.assertEqual(response.context["credit_card_limit"], Decimal("880.05"))
        self.assertEqual(
            response.context["consolidated_balance"],
            response.context["current_balance"],
        )
        self.assertContains(response, "Cartão em aberto")
        self.assertContains(response, "Total cartão")
        self.assertContains(response, "Balanço consolidado")
        self.assertContains(response, "R$ 750,05")
        self.assertContains(response, "R$ 870,05")
        self.assertContains(response, "R$ 880,05")

    def test_statement_balance_shows_monthly_income_and_expense_totals(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Despesas mensais",
            category_type=Category.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("250.50"),
            date=date(2026, 2, 12),
            account=self.account,
            category=expense_category,
            description="Despesa de fevereiro",
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.get(reverse("transactions:statement"), {"month": "2026-02"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["monthly_income_total"], Decimal("7000.00"))
        self.assertEqual(response.context["monthly_expense_total"], Decimal("250.50"))
        self.assertContains(response, "Totais do mês")
        self.assertContains(response, "txn-month-total-income")
        self.assertContains(response, "txn-month-total-expense")
        self.assertContains(response, "R$ 7.000,00")
        self.assertContains(response, "R$ 250,50")

    def test_toggle_cleared_with_htmx_returns_redirect_header(self):
        response = self.client.post(
            reverse("transactions:toggle-cleared", args=[self.feb.pk]),
            data={"next": "/transactions/?month=2026-02", "cleared_date": "2026-02-22"},
            HTTP_HX_REQUEST="true",
        )

        self.assertEqual(response.status_code, 204)
        self.assertIn("HX-Redirect", response.headers)
        self.assertEqual(response.headers["HX-Redirect"], "/transactions/?month=2026-02")

    def test_toggle_cleared_requires_cleared_date(self):
        response = self.client.post(
            reverse("transactions:toggle-cleared", args=[self.feb.pk]),
            data={"next": "/transactions/?month=2026-02"},
        )

        self.assertEqual(response.status_code, 302)
        self.feb.refresh_from_db()
        self.assertFalse(self.feb.is_cleared)

    def test_toggle_cleared_get_renders_date_modal(self):
        response = self.client.get(
            reverse("transactions:toggle-cleared", args=[self.feb.pk]),
            {"next": "/transactions/?month=2026-02"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Data da baixa")
        self.assertContains(response, 'name="cleared_date"', html=False)
        self.assertContains(response, "Confirmar baixa")

    def test_toggle_cleared_from_modal_closes_modal(self):
        response = self.client.post(
            reverse("transactions:toggle-cleared", args=[self.feb.pk]),
            data={
                "next": "/transactions/?month=2026-02",
                "cleared_date": "2026-02-22",
                "modal": "1",
            },
            HTTP_HX_REQUEST="true",
        )

        self.assertEqual(response.status_code, 204)
        self.assertIn("HX-Trigger", response.headers)
        self.assertIn("closeModal", response.headers["HX-Trigger"])
        self.assertNotIn("HX-Redirect", response.headers)

    def test_toggle_ignored_with_htmx_returns_redirect_header(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Streaming",
            category_type=Category.CategoryType.EXPENSE,
        )
        expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("99.00"),
            date=date(2026, 2, 20),
            account=self.account,
            category=expense_category,
            description="Servico",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.post(
            reverse("transactions:toggle-ignored", args=[expense.pk]),
            data={"next": "/transactions/?month=2026-02"},
            HTTP_HX_REQUEST="true",
        )

        self.assertEqual(response.status_code, 204)
        self.assertIn("HX-Redirect", response.headers)
        self.assertEqual(response.headers["HX-Redirect"], "/transactions/?month=2026-02")

    def test_toggle_ignored_rejects_external_next_redirect(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Streaming externo",
            category_type=Category.CategoryType.EXPENSE,
        )
        expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("99.00"),
            date=date(2026, 2, 20),
            account=self.account,
            category=expense_category,
            description="Servico externo",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.post(
            reverse("transactions:toggle-ignored", args=[expense.pk]),
            data={"next": "//evil.example/phish"},
            HTTP_HX_REQUEST="true",
        )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.headers["HX-Redirect"], reverse("transactions:statement"))

    def test_toggle_cleared_removes_ignored_flag_and_sets_baixada(self):
        expense_category = Category.objects.create(
            user=self.user,
            name="Condominio",
            category_type=Category.CategoryType.EXPENSE,
        )
        expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("200.00"),
            date=date(2026, 2, 18),
            account=self.account,
            category=expense_category,
            description="Condominio",
            is_cleared=False,
            is_ignored=True,
            recurrence_type=Transaction.RecurrenceType.ONCE,
        )

        response = self.client.post(
            reverse("transactions:toggle-cleared", args=[expense.pk]),
            data={"next": "/transactions/?month=2026-02", "cleared_date": "2026-02-25"},
        )
        self.assertEqual(response.status_code, 302)

        expense.refresh_from_db()
        self.assertTrue(expense.is_cleared)
        self.assertFalse(expense.is_ignored)
        self.assertEqual(expense.date, date(2026, 2, 25))



    def test_create_closed_month_with_password_allows_creation(self):
        self._close_month(2026, 2)

        response = self.client.post(
            reverse("transactions:create"),
            data=self._build_create_payload(unlock_password="scope-pass-123"),
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            Transaction.objects.filter(
                user=self.user,
                date=date(2026, 2, 5),
                description="Extra",
            ).exists()
        )






