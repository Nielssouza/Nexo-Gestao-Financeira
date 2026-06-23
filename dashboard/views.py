from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.views.generic import TemplateView

from accounts.models import Account
from common.balance import (
    calculate_credit_card_available_limit,
    calculate_monthly_balance,
    calculate_user_balance,
)
from common.months import month_bounds, month_value_to_date, shift_month
from investments.models import Investment, InvestmentEntry
from transactions.models import Transaction


MONTH_NAMES_PT = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Marco",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
}


class DashboardContextMixin(LoginRequiredMixin):
    category_palette = ["#0b0b0f", "#7abf00", "#d1d5db", "#9ca3af", "#fb7185"]

    def _get_selected_month(self) -> date:
        today = timezone.localdate()
        selected_value = (self.request.GET.get("month") or "").strip()

        if not selected_value:
            return today.replace(day=1)

        selected_month = month_value_to_date(selected_value)
        return selected_month or today.replace(day=1)

    def _get_month_bounds(self, selected_month: date):
        return month_bounds(selected_month)

    def _build_month_navigation(self, selected_month: date):
        prev_month = shift_month(selected_month, -1)
        next_month = shift_month(selected_month, 1)

        prev_params = self.request.GET.copy()
        prev_params["month"] = f"{prev_month.year:04d}-{prev_month.month:02d}"

        next_params = self.request.GET.copy()
        next_params["month"] = f"{next_month.year:04d}-{next_month.month:02d}"

        selected_label = f"{MONTH_NAMES_PT.get(selected_month.month, '')} {selected_month.year}"
        return selected_label, prev_params.urlencode(), next_params.urlencode()

    def _build_category_chart(self, base_queryset, total_amount):
        rows = list(
            base_queryset.values("category__name")
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
            .order_by("-total")
        )

        if total_amount <= 0:
            return [], "conic-gradient(#2b2f3a 0 100%)"

        segments = []
        running_total = Decimal("0.00")
        top_rows = rows[:4]

        for idx, row in enumerate(top_rows):
            amount = row["total"] or Decimal("0.00")
            if amount <= 0:
                continue
            running_total += amount
            segments.append(
                {
                    "name": row["category__name"] or "Sem categoria",
                    "total": amount,
                    "color": self.category_palette[idx % len(self.category_palette)],
                }
            )

        remainder = total_amount - running_total
        if remainder > 0:
            segments.append(
                {
                    "name": "Outros",
                    "total": remainder,
                    "color": self.category_palette[len(segments) % len(self.category_palette)],
                }
            )

        total_float = float(total_amount)
        cursor = 0.0
        stops = []
        for segment in segments:
            percent = (float(segment["total"]) / total_float) * 100
            end = cursor + percent
            segment["percent"] = percent
            stops.append(f"{segment['color']} {cursor:.2f}% {end:.2f}%")
            cursor = end

        if cursor < 100:
            stops.append(f"#2b2f3a {cursor:.2f}% 100%")

        return segments, f"conic-gradient({', '.join(stops)})"

    def _build_full_category_breakdown(self, base_queryset):
        rows = list(
            base_queryset.values("category__name")
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
            .order_by("-total")
        )

        cleaned_rows = []
        total_amount = Decimal("0.00")
        for row in rows:
            amount = row["total"] or Decimal("0.00")
            if amount <= 0:
                continue

            name = row["category__name"] or "Sem categoria"
            cleaned_rows.append(
                {
                    "name": name,
                    "total": amount,
                }
            )
            total_amount += amount

        if total_amount <= 0:
            return [], "conic-gradient(#2b2f3a 0 100%)", Decimal("0.00")

        items = []
        total_float = float(total_amount)
        cursor = 0.0
        stops = []

        for idx, row in enumerate(cleaned_rows):
            percent = (float(row["total"]) / total_float) * 100
            color = self.category_palette[idx % len(self.category_palette)]
            end = cursor + percent

            items.append(
                {
                    "name": row["name"],
                    "total": row["total"],
                    "percent": percent,
                    "percent_label": f"{percent:.2f}".replace(".", ","),
                    "color": color,
                    "icon_letter": row["name"].strip()[:1].upper() or "?",
                }
            )

            stops.append(f"{color} {cursor:.2f}% {end:.2f}%")
            cursor = end

        if cursor < 100:
            stops.append(f"#2b2f3a {cursor:.2f}% 100%")

        return items, f"conic-gradient({', '.join(stops)})", total_amount

    def _build_expense_trend(self, tenant, selected_month: date):
        points = []
        for offset in range(-5, 1):
            month_date = shift_month(selected_month, offset)
            total = (
                Transaction.objects.filter(
                    tenant=tenant,
                    transaction_type=Transaction.TransactionType.EXPENSE,
                    is_ignored=False,
                    date__year=month_date.year,
                    date__month=month_date.month,
                ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
                or Decimal("0.00")
            )
            short_month = MONTH_NAMES_PT.get(month_date.month, "")[:3]
            points.append(
                {
                    "label": f"{short_month}/{month_date.year % 100:02d}",
                    "total": total,
                    "is_current": offset == 0,
                }
            )

        max_total = max((point["total"] for point in points), default=Decimal("0.00"))
        denominator = max_total if max_total > 0 else Decimal("1.00")

        for point in points:
            if point["total"] <= 0:
                point["height_percent"] = 6.0
                continue
            raw_height = float((point["total"] / denominator) * Decimal("100.00"))
            point["height_percent"] = max(10.0, raw_height)

        return points

    def get_dashboard_context(self):
        user = self.request.user
        tenant = self.request.tenant
        today = timezone.localdate()
        selected_month = self._get_selected_month()
        month_start, next_month_start = self._get_month_bounds(selected_month)

        current_month_transactions = Transaction.objects.filter(
            tenant=tenant,
            is_ignored=False,
            date__gte=month_start,
            date__lt=next_month_start,
        )

        monthly_income = current_month_transactions.filter(
            transaction_type=Transaction.TransactionType.INCOME
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

        monthly_expense = current_month_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

        end_of_selected_month = shift_month(selected_month, 1) - timedelta(days=1)
        balance_cutoff_date = end_of_selected_month

        latest_transactions = (
            Transaction.objects.filter(tenant=tenant, is_ignored=False)
            .select_related("account", "category", "destination_account")
            .order_by("-date", "-created_at")[:6]
        )

        due_notifications_qs = (
            Transaction.objects.filter(
                tenant=tenant,
                transaction_type=Transaction.TransactionType.EXPENSE,
                is_cleared=False,
                is_ignored=False,
                date__gte=month_start,
                date__lt=next_month_start,
            )
            .select_related("account", "category")
            .order_by("date", "created_at")
        )
        due_notifications_count = due_notifications_qs.count()
        due_overdue_count = due_notifications_qs.filter(date__lt=today).count()
        due_notifications = list(due_notifications_qs[:6])

        pending_expenses = current_month_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_cleared=False,
        )

        pending_expense_total = pending_expenses.aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]
        pending_expense_count = pending_expenses.count()

        credit_card_expenses = current_month_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE,
            account__account_type=Account.AccountType.CARD,
        )
        credit_card_month_total = credit_card_expenses.aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]
        credit_card_open_expenses = credit_card_expenses.filter(is_cleared=False)
        credit_card_expense_total = credit_card_open_expenses.aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]
        credit_card_expense_count = credit_card_open_expenses.count()
        credit_card_month_count = credit_card_expenses.count()
        credit_card_limit = calculate_credit_card_available_limit(tenant, selected_month)
        monthly_balance = calculate_monthly_balance(user, selected_month, tenant=tenant)
        
        pending_bank_total = pending_expenses.exclude(
            account__account_type=Account.AccountType.CARD
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

        category_source = current_month_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE
        )
        category_total = monthly_expense
        category_title = "Despesas por categoria"
        category_empty = "Sem despesas no mes selecionado."

        category_segments, category_donut_style = self._build_category_chart(
            category_source,
            category_total,
        )

        active_investments = Investment.objects.filter(tenant=tenant, is_active=True)
        investment_count = active_investments.count()

        investment_entries = InvestmentEntry.objects.filter(
            tenant=tenant,
            investment__is_active=True,
        )
        total_invested = investment_entries.filter(
            entry_type=InvestmentEntry.EntryType.DEPOSIT
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        total_withdrawn = investment_entries.filter(
            entry_type=InvestmentEntry.EntryType.WITHDRAWAL
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        total_earnings = investment_entries.filter(
            entry_type__in=[InvestmentEntry.EntryType.DIVIDEND, InvestmentEntry.EntryType.YIELD]
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        net_invested = total_invested - total_withdrawn

        type_colors = {
            "stocks": "#7c3aed",
            "fii": "#06b6d4",
            "fixed_income": "#22c55e",
            "crypto": "#f59e0b",
            "savings": "#38bdf8",
            "emergency": "#f87171",
            "other": "#94a3b8",
        }
        inv_by_type_rows = (
            investment_entries.filter(entry_type=InvestmentEntry.EntryType.DEPOSIT)
            .values("investment__investment_type")
            .annotate(total=Coalesce(Sum("amount"), Decimal("0.00")))
            .order_by("-total")
        )
        inv_by_type = []
        for row in inv_by_type_rows:
            itype = row["investment__investment_type"] or "other"
            amount = row["total"] or Decimal("0.00")
            if amount <= 0:
                continue
            pct = float((amount / total_invested * 100)) if total_invested > 0 else 0.0
            inv_by_type.append({
                "type": itype,
                "label": dict(Investment.InvestmentType.choices).get(itype, itype),
                "amount": amount,
                "pct": round(pct, 1),
                "color": type_colors.get(itype, "#94a3b8"),
            })

        total_balance = calculate_user_balance(user, balance_cutoff_date, tenant=tenant)
        consolidated_balance = total_balance + net_invested
        balance_after_pending = consolidated_balance - pending_bank_total

        selected_month_label, prev_month_query, next_month_query = self._build_month_navigation(
            selected_month
        )

        return {
            "total_balance": total_balance,
            "monthly_income": monthly_income,
            "monthly_expense": monthly_expense,
            "monthly_balance": monthly_balance,
            "category_title": category_title,
            "category_empty": category_empty,
            "latest_transactions": latest_transactions,
            "selected_month_label": selected_month_label,
            "selected_month_value": f"{selected_month.year:04d}-{selected_month.month:02d}",
            "prev_month_query": prev_month_query,
            "next_month_query": next_month_query,
            "today": today,
            "pending_expense_total": pending_expense_total,
            "pending_expense_count": pending_expense_count,
            "credit_card_expense_total": credit_card_expense_total,
            "credit_card_expense_count": credit_card_expense_count,
            "credit_card_open_total": credit_card_expense_total,
            "credit_card_month_total": credit_card_month_total,
            "credit_card_month_count": credit_card_month_count,
            "credit_card_limit": credit_card_limit,
            "consolidated_balance": consolidated_balance,
            "balance_after_pending": balance_after_pending,
            "due_notifications": due_notifications,
            "due_notifications_count": due_notifications_count,
            "due_overdue_count": due_overdue_count,
            "category_segments": category_segments,
            "category_donut_style": category_donut_style,
            "investment_count": investment_count,
            "total_invested": total_invested,
            "total_withdrawn": total_withdrawn,
            "total_earnings": total_earnings,
            "net_invested": net_invested,
            "inv_by_type": inv_by_type,
        }


class DashboardHomeView(DashboardContextMixin, TemplateView):
    template_name = "dashboard/home.html"
    public_template_name = "dashboard/landing.html"

    def dispatch(self, request, *args, **kwargs):
        self.show_public_landing = not request.user.is_authenticated
        if self.show_public_landing:
            return TemplateView.dispatch(self, request, *args, **kwargs)
        return super().dispatch(request, *args, **kwargs)

    def get_template_names(self):
        if getattr(self, "show_public_landing", False):
            return [self.public_template_name]
        return [self.template_name]

    def get_context_data(self, **kwargs):
        context = TemplateView.get_context_data(self, **kwargs)
        if getattr(self, "show_public_landing", False):
            return context
        context.update(self.get_dashboard_context())
        context["show_post_login_loader"] = bool(
            self.request.session.pop("show_post_login_loader", False)
        )
        return context


class DashboardChartsView(DashboardContextMixin, TemplateView):
    template_name = "dashboard/charts.html"
    ALLOWED_CHART_MODES = {"donut", "trend", "list"}

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.update(self.get_dashboard_context())

        chart_mode = (self.request.GET.get("mode") or "list").strip().lower()
        if chart_mode not in self.ALLOWED_CHART_MODES:
            chart_mode = "list"

        selected_month = self._get_selected_month()
        monthly_expense_queryset = Transaction.objects.filter(
            tenant=self.request.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_ignored=False,
            date__year=selected_month.year,
            date__month=selected_month.month,
        )

        charts_items, charts_donut_style, charts_total = self._build_full_category_breakdown(
            monthly_expense_queryset
        )

        ranking_scope_label = context.get("selected_month_label", "Mes atual")
        ranking_scope_note = ""

        for idx, item in enumerate(charts_items, start=1):
            item["rank"] = idx

        trend_points = self._build_expense_trend(self.request.tenant, selected_month)

        context.update(
            {
                "charts_items": charts_items,
                "charts_donut_style": charts_donut_style,
                "charts_total": charts_total,
                "ranking_scope_label": ranking_scope_label,
                "ranking_scope_note": ranking_scope_note,
                "trend_points": trend_points,
                "selected_chart_mode": chart_mode,
            }
        )
        return context



