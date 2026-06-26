"""Dashboard API — returns aggregated financial data for the selected month."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from common.api_mixins import get_user_tenant
from common.balance import (
    calculate_credit_card_available_limit,
    calculate_monthly_balance,
    calculate_user_balance,
)
from common.months import month_bounds, month_value_to_date, shift_month
from investments.models import InvestmentEntry
from invoices.models import Invoice
from transactions.models import Transaction

ZERO = Decimal("0.00")

MONTH_NAMES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Marco", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
}


class DashboardView(APIView):
    """GET /api/v1/dashboard/?month=YYYY-MM"""

    def get(self, request):
        tenant = getattr(request, "tenant", None) or get_user_tenant(request.user)
        today = timezone.localdate()

        # Resolve selected month
        month_param = (request.query_params.get("month") or "").strip()
        if month_param:
            selected_month = month_value_to_date(month_param) or today.replace(day=1)
        else:
            selected_month = today.replace(day=1)

        # month_bounds returns (first_day, first_day_of_next_month)
        month_start, next_month_start = month_bounds(selected_month)
        end_of_selected_month = next_month_start - timedelta(days=1)

        # Monthly transactions (matches views.py: date__lt=next_month_start)
        monthly_txns = Transaction.objects.filter(
            tenant=tenant,
            is_ignored=False,
            date__gte=month_start,
            date__lt=next_month_start,
        )

        # Income / Expense — no include_in_balance filter (matches views.py)
        income = monthly_txns.filter(
            transaction_type=Transaction.TransactionType.INCOME,
        ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]

        expense = monthly_txns.filter(
            transaction_type=Transaction.TransactionType.EXPENSE,
        ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]

        # Balances — cutoff = end_of_selected_month (matches views.py)
        user_balance = calculate_user_balance(
            request.user, cutoff_date=end_of_selected_month, tenant=tenant
        )
        monthly_balance = calculate_monthly_balance(
            request.user, selected_month, tenant=tenant
        )
        credit_available = calculate_credit_card_available_limit(
            tenant, selected_month
        )

        # Pendências e alertas
        pending_expenses = monthly_txns.filter(
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_cleared=False,
        )
        pending_expense_total = pending_expenses.aggregate(
            total=Coalesce(Sum("amount"), ZERO)
        )["total"]
        pending_expense_count = pending_expenses.count()

        card_expenses = monthly_txns.filter(
            transaction_type=Transaction.TransactionType.EXPENSE,
            account__account_type=Account.AccountType.CARD,
        )
        credit_card_month_total = card_expenses.aggregate(
            total=Coalesce(Sum("amount"), ZERO)
        )["total"]
        credit_card_month_count = card_expenses.count()
        card_open = card_expenses.filter(is_cleared=False)
        credit_card_open_total = card_open.aggregate(
            total=Coalesce(Sum("amount"), ZERO)
        )["total"]
        credit_card_open_count = card_open.count()

        pending_bank_total = pending_expenses.exclude(
            account__account_type=Account.AccountType.CARD
        ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]

        # Investments net (matches views.py: deposits - withdrawals)
        inv_entries = InvestmentEntry.objects.filter(tenant=tenant, investment__is_active=True)
        inv_deposited = inv_entries.filter(
            entry_type=InvestmentEntry.EntryType.DEPOSIT
        ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
        inv_withdrawn = inv_entries.filter(
            entry_type=InvestmentEntry.EntryType.WITHDRAWAL
        ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
        net_invested = inv_deposited - inv_withdrawn

        safe_credit = credit_available if credit_available is not None else ZERO
        consolidated_balance = user_balance + safe_credit + net_invested
        balance_after_pending = consolidated_balance - pending_bank_total

        # Category breakdown (expenses)
        expense_by_category = list(
            monthly_txns.filter(
                transaction_type=Transaction.TransactionType.EXPENSE,
            )
            .values("category__name")
            .annotate(total=Coalesce(Sum("amount"), ZERO))
            .order_by("-total")
        )

        # Income by category
        income_by_category = list(
            monthly_txns.filter(
                transaction_type=Transaction.TransactionType.INCOME,
            )
            .values("category__name")
            .annotate(total=Coalesce(Sum("amount"), ZERO))
            .order_by("-total")
        )

        # Expense trend (last 6 months — matches views.py)
        expense_trend = []
        for offset in range(-5, 1):
            month_date = shift_month(selected_month, offset)
            total = (
                Transaction.objects.filter(
                    tenant=tenant,
                    transaction_type=Transaction.TransactionType.EXPENSE,
                    is_ignored=False,
                    date__year=month_date.year,
                    date__month=month_date.month,
                ).aggregate(total=Coalesce(Sum("amount"), ZERO))["total"]
            )
            short_month = MONTH_NAMES_PT.get(month_date.month, "")[:3]
            expense_trend.append({
                "label": f"{short_month}/{month_date.year % 100:02d}",
                "total": str(total),
                "is_current": offset == 0,
            })

        # Accounts summary
        accounts = []
        for acct in Account.objects.filter(tenant=tenant, is_active=True).order_by("name"):
            accounts.append({
                "id": acct.pk,
                "name": acct.name,
                "account_type": acct.account_type,
                "balance": str(acct.balance),
                "include_in_balance": acct.include_in_balance,
            })

        # Invoices summary — excludes CANCELLED (matches views.py)
        invoices_summary = Invoice.objects.filter(
            tenant=tenant,
            issue_date__year=selected_month.year,
            issue_date__month=selected_month.month,
        ).exclude(status=Invoice.CANCELLED).aggregate(
            total_gross=Coalesce(Sum("gross_value"), ZERO),
            count=Count("id"),
        )

        investments_total = net_invested

        # Due notifications (unpaid expenses in selected month)
        due_qs = Transaction.objects.filter(
            tenant=tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_cleared=False,
            is_ignored=False,
            date__gte=month_start,
            date__lt=next_month_start,
        ).select_related("account", "category").order_by("date", "created_at")

        due_count = due_qs.count()
        due_overdue_count = due_qs.filter(date__lt=today).count()
        due_list = [
            {
                "id": t.pk,
                "description": t.description or "Sem descricao",
                "amount": str(t.amount),
                "date": t.date.isoformat(),
                "category": t.category.name if t.category else None,
                "account": t.account.name if t.account else None,
                "overdue": t.date < today,
            }
            for t in due_qs[:6]
        ]

        return Response({
            "selected_month": selected_month.isoformat(),
            "month_label": f"{MONTH_NAMES_PT.get(selected_month.month, '')} {selected_month.year}",
            "kpis": {
                "user_balance": str(user_balance),
                "monthly_income": str(income),
                "monthly_expense": str(expense),
                "monthly_balance": str(monthly_balance),
                "credit_available": str(credit_available),
                "investments_total": str(investments_total),
            },
            "alerts": {
                "pending_expense_count": pending_expense_count,
                "pending_expense_total": str(pending_expense_total),
                "credit_card_open_count": credit_card_open_count,
                "credit_card_open_total": str(credit_card_open_total),
                "credit_card_month_count": credit_card_month_count,
                "credit_card_month_total": str(credit_card_month_total),
                "credit_card_limit": str(safe_credit),
                "consolidated_balance": str(consolidated_balance),
                "balance_after_pending": str(balance_after_pending),
            },
            "invoices": {
                "total_gross": str(invoices_summary["total_gross"]),
                "count": invoices_summary["count"],
            },
            "expense_by_category": [
                {"name": row["category__name"] or "Sem categoria", "total": str(row["total"])}
                for row in expense_by_category
                if row["total"] > 0
            ],
            "income_by_category": [
                {"name": row["category__name"] or "Sem categoria", "total": str(row["total"])}
                for row in income_by_category
                if row["total"] > 0
            ],
            "expense_trend": expense_trend,
            "accounts": accounts,
            "due_notifications": {
                "count": due_count,
                "overdue_count": due_overdue_count,
                "items": due_list,
            },
        })
