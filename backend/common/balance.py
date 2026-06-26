from decimal import Decimal

from django.apps import apps
from django.db import models
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from common.tenancy import resolve_tenant
from transactions.models import Transaction


ZERO = Decimal("0.00")


def _sum_amount(queryset):
    return queryset.aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]


def tracked_accounts(queryset):
    return queryset.filter(
        include_in_balance=True,
        account_type__in=["bank", "cash"],
    )


def calculate_account_balance(account, cutoff_date=None):
    if not account.include_in_balance and account.account_type != "card":
        return ZERO

    cutoff_date = cutoff_date or timezone.localdate()

    posted_transactions = account.transactions.filter(
        is_cleared=True,
        is_ignored=False,
        date__lte=cutoff_date,
    )
    incoming_transfers = account.incoming_transfers.filter(
        transaction_type=Transaction.TransactionType.TRANSFER,
        is_cleared=True,
        is_ignored=False,
        date__lte=cutoff_date,
    )

    income = _sum_amount(
        posted_transactions.filter(transaction_type=Transaction.TransactionType.INCOME)
    )
    expense = _sum_amount(
        posted_transactions.filter(transaction_type=Transaction.TransactionType.EXPENSE)
    )
    outgoing_transfers = _sum_amount(
        posted_transactions.filter(transaction_type=Transaction.TransactionType.TRANSFER)
    )
    incoming_total = _sum_amount(incoming_transfers)

    return (
        account.initial_balance
        + income
        + incoming_total
        - expense
        - outgoing_transfers
    )


def calculate_user_balance(user, cutoff_date, tenant=None):
    tenant = resolve_tenant(tenant=tenant, user=user)
    account_model = apps.get_model("accounts", "Account")
    active_accounts = account_model.objects.filter(tenant=tenant, is_active=True).filter(
        models.Q(include_in_balance=True, account_type__in=["bank", "cash"])
        | models.Q(account_type="card")
    )
    total_balance = ZERO
    for account in active_accounts:
        total_balance += calculate_account_balance(account, cutoff_date=cutoff_date)
    return total_balance


def calculate_credit_card_available_limit(tenant, selected_month):
    account_model = apps.get_model("accounts", "Account")
    monthly_limit_model = apps.get_model("accounts", "CardMonthlyLimit")
    transaction_model = apps.get_model("transactions", "Transaction")
    is_current_month = True

    active_cards = account_model.objects.filter(
        tenant=tenant,
        account_type="card",
        is_active=True,
    )

    total_available = ZERO

    for card in active_cards:
        monthly_limit = monthly_limit_model.objects.filter(
            tenant=tenant,
            account=card,
            year=selected_month.year,
            month=selected_month.month,
        ).values_list("amount", flat=True).first()

        if monthly_limit is not None and monthly_limit > 0:
            card_limit = monthly_limit
        elif not is_current_month:
            # Meses que não são o atual sem limite explícito são ignorados — cada mês é isolado.
            continue
        elif card.credit_limit is not None and card.credit_limit > 0:
            card_limit = card.credit_limit
        else:
            monthly_income = transaction_model.objects.filter(
                tenant=tenant,
                account=card,
                is_cleared=True,
                is_ignored=False,
                date__year=selected_month.year,
                date__month=selected_month.month,
                transaction_type=Transaction.TransactionType.INCOME,
            ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
            card_limit = card.initial_balance + monthly_income
            if card_limit <= 0:
                continue

        monthly_expenses = transaction_model.objects.filter(
            tenant=tenant,
            account=card,
            is_cleared=True,
            is_ignored=False,
            date__year=selected_month.year,
            date__month=selected_month.month,
            transaction_type=Transaction.TransactionType.EXPENSE,
        ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]

        available = card_limit - monthly_expenses
        if available > 0:
            total_available += available

    return total_available


def calculate_monthly_balance(user, selected_month, account=None, category=None, tenant=None):
    tenant = resolve_tenant(tenant=tenant, user=user)
    monthly_transactions = Transaction.objects.filter(
        tenant=tenant,
        is_ignored=False,
        date__year=selected_month.year,
        date__month=selected_month.month,
    )

    if category:
        monthly_transactions = monthly_transactions.filter(category=category)

    if account:
        if not account.include_in_balance:
            return ZERO

        income = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.INCOME,
                account=account,
            )
        )
        expense = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.EXPENSE,
                account=account,
            )
        )
        outgoing_transfers = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.TRANSFER,
                account=account,
            )
        )
        incoming_transfers = _sum_amount(
            monthly_transactions.filter(
                transaction_type=Transaction.TransactionType.TRANSFER,
                destination_account=account,
            )
        )

        return income + incoming_transfers - expense - outgoing_transfers

    income = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.INCOME
        ).filter(account__include_in_balance=True)
    )
    expense = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE
        ).filter(account__include_in_balance=True)
    )
    outgoing_transfers = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.TRANSFER
        ).filter(account__include_in_balance=True)
    )
    incoming_transfers = _sum_amount(
        monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.TRANSFER
        ).filter(destination_account__include_in_balance=True)
    )

    return income + incoming_transfers - expense - outgoing_transfers
