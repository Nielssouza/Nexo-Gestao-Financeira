import json
from datetime import date, timedelta
from decimal import Decimal

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import F, Q, Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404, render
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.utils.formats import date_format
from django.views import View
from django.views.generic import CreateView, DeleteView, TemplateView, UpdateView

from accounts.models import Account
from common.balance import (
    calculate_credit_card_available_limit,
    calculate_monthly_balance,
    calculate_user_balance,
)
from common.mixins import UserAssignMixin, UserQuerySetMixin
from common.months import month_value_to_date, shift_month
from common.security import resolve_safe_redirect_url
from transactions.forms import QuickTransactionForm, StatementFilterForm, TransactionForm
from transactions.models import ClosedMonth, Transaction


class TransactionFormKwargsMixin:
    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.request.user
        kwargs["tenant"] = self.request.tenant
        return kwargs


class MonthLockMixin:
    unlock_field_name = "unlock_password"
    closed_month_error = "Mes fechado: informe sua senha para confirmar esta alteracao."

    def is_month_closed(self, target_date):
        return ClosedMonth.objects.filter(
            tenant=self.request.tenant,
            is_closed=True,
            year=target_date.year,
            month=target_date.month,
        ).exists()

    def queryset_has_closed_month(self, queryset):
        month_pairs = set(queryset.values_list("date__year", "date__month").distinct())
        if not month_pairs:
            return False

        closed_pairs = set(
            ClosedMonth.objects.filter(tenant=self.request.tenant, is_closed=True).values_list(
                "year", "month"
            )
        )
        return any(pair in closed_pairs for pair in month_pairs)

    def is_unlock_password_valid(self):
        password = (self.request.POST.get(self.unlock_field_name) or "").strip()
        if not password:
            return False
        return self.request.user.check_password(password)

    def ensure_month_unlocked(self, queryset, form=None):
        if not self.queryset_has_closed_month(queryset):
            return True
        if self.is_unlock_password_valid():
            return True
        if form:
            form.add_error(None, self.closed_month_error)
        return False


class RecurrenceScopeMixin:
    SCOPE_CURRENT = "current"
    SCOPE_ALL = "all"

    def get_scope(self):
        value = (
            self.request.POST.get("scope")
            or self.request.GET.get("scope")
            or self.SCOPE_CURRENT
        )
        value = (value or "").strip().lower()
        if value not in {self.SCOPE_CURRENT, self.SCOPE_ALL}:
            return self.SCOPE_CURRENT
        return value

    def get_scope_options(self):
        return [
            {"value": self.SCOPE_CURRENT, "label": "Somente esta transacao"},
            {"value": self.SCOPE_ALL, "label": "Todas pendentes"},
        ]

    def get_related_occurrences_queryset(self, reference_transaction):
        queryset = Transaction.objects.filter(tenant=self.request.tenant).exclude(
            pk=reference_transaction.pk
        )

        return queryset.filter(
            transaction_type=reference_transaction.transaction_type,
            amount=reference_transaction.amount,
            account=reference_transaction.account,
            destination_account=reference_transaction.destination_account,
            category=reference_transaction.category,
            description=reference_transaction.description,
            recurrence_type=reference_transaction.recurrence_type,
            recurrence_interval=reference_transaction.recurrence_interval,
            recurrence_interval_unit=reference_transaction.recurrence_interval_unit,
            installment_count=reference_transaction.installment_count,
            is_cleared=False,
            date__gte=reference_transaction.date,
        )

    def get_scope_queryset(self, reference_transaction, scope):
        ids = [reference_transaction.pk]
        if scope == self.SCOPE_ALL:
            ids.extend(
                self.get_related_occurrences_queryset(reference_transaction).values_list(
                    "pk", flat=True
                )
            )
        return Transaction.objects.filter(tenant=self.request.tenant, pk__in=ids)

    def update_related_occurrences(self, reference_transaction, updated_transaction):
        update_payload = {
            "transaction_type": updated_transaction.transaction_type,
            "amount": updated_transaction.amount,
            "account": updated_transaction.account,
            "destination_account": updated_transaction.destination_account,
            "category": updated_transaction.category,
            "description": updated_transaction.description,
            "recurrence_type": updated_transaction.recurrence_type,
            "recurrence_interval": updated_transaction.recurrence_interval,
            "recurrence_interval_unit": updated_transaction.recurrence_interval_unit,
            "installment_count": updated_transaction.installment_count,
        }
        if updated_transaction.recurrence_type == Transaction.RecurrenceType.INSTALLMENT:
            update_payload["installment_number"] = F("installment_number")
        else:
            update_payload["installment_number"] = None

        return self.get_related_occurrences_queryset(reference_transaction).update(
            **update_payload
        )

    def delete_related_occurrences(self, reference_transaction):
        deleted_count, _ = self.get_related_occurrences_queryset(
            reference_transaction
        ).delete()
        return deleted_count


class TransactionCreateView(
    MonthLockMixin, UserAssignMixin, TransactionFormKwargsMixin, CreateView
):
    model = Transaction
    form_class = TransactionForm
    template_name = "transactions/transaction_form.html"
    success_url = reverse_lazy("transactions:statement")

    def form_valid(self, form):
        response = super().form_valid(form)
        if self.object.recurrence_type != Transaction.RecurrenceType.ONCE:
            self.object.generate_future_occurrences()
        return response


class TransactionUpdateView(
    UserQuerySetMixin,
    MonthLockMixin,
    RecurrenceScopeMixin,
    TransactionFormKwargsMixin,
    UpdateView,
):
    model = Transaction
    form_class = TransactionForm
    template_name = "transactions/transaction_form.html"
    success_url = reverse_lazy("transactions:statement")

    def _resolve_return_url(self):
        next_url = (
            self.request.POST.get("next")
            or self.request.GET.get("next")
            or ""
        )
        return resolve_safe_redirect_url(
            self.request,
            next_url,
            self.success_url,
            replacements=(("/transactions/partial/", "/transactions/"),),
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["scope_options"] = self.get_scope_options()
        context["selected_scope"] = self.get_scope()
        context["return_url"] = self._resolve_return_url()
        return context

    def get_success_url(self):
        return self._resolve_return_url()

    def form_valid(self, form):
        scope = self.get_scope()
        reference_transaction = Transaction.objects.get(
            pk=self.object.pk,
            tenant=self.request.tenant,
        )
        target_queryset = self.get_scope_queryset(reference_transaction, scope)

        response = super().form_valid(form)

        if scope == self.SCOPE_ALL:
            updated_count = self.update_related_occurrences(
                reference_transaction,
                self.object,
            )
            if updated_count:
                messages.success(
                    self.request,
                    f"Alteracao aplicada em {updated_count + 1} transacoes da recorrencia.",
                )
        return response


class TransactionDeleteView(
    UserQuerySetMixin,
    MonthLockMixin,
    RecurrenceScopeMixin,
    DeleteView,
):
    model = Transaction
    template_name = "transactions/transaction_confirm_delete.html"
    success_url = reverse_lazy("transactions:statement")

    def _resolve_return_url(self):
        next_url = (
            self.request.POST.get("next")
            or self.request.GET.get("next")
            or ""
        )
        return resolve_safe_redirect_url(
            self.request,
            next_url,
            self.success_url,
            replacements=(("/transactions/partial/", "/transactions/"),),
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["scope_options"] = self.get_scope_options()
        context["selected_scope"] = self.get_scope()
        context["return_url"] = self._resolve_return_url()
        return context

    def get_success_url(self):
        return self._resolve_return_url()

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        scope = self.get_scope()
        target_queryset = self.get_scope_queryset(self.object, scope)

        if target_queryset.filter(is_cleared=True).exists():
            messages.error(
                request,
                "Lancamentos baixados nao podem ser excluidos.",
            )
            context = self.get_context_data(object=self.object)
            return self.render_to_response(context)

        related_deleted = 0
        if scope == self.SCOPE_ALL:
            related_deleted = self.delete_related_occurrences(self.object)

        success_url = self.get_success_url()
        self.object.delete()

        if scope == self.SCOPE_ALL:
            messages.success(
                request,
                f"Exclusao aplicada em {related_deleted + 1} transacoes da recorrencia.",
            )

        return HttpResponseRedirect(success_url)


class StatementViewBase(LoginRequiredMixin, TemplateView):
    template_name = "transactions/statement.html"

    def get_filter_form(self):
        return StatementFilterForm(
            self.request.GET,
            user=self.request.user,
            tenant=self.request.tenant,
        )

    def get_selected_month(self):
        requested_value = self.request.GET.get("month", "")
        parsed_value = month_value_to_date(requested_value)

        if parsed_value:
            return parsed_value, requested_value

        current_month = timezone.localdate().replace(day=1)
        return current_month, current_month.strftime("%Y-%m")

    def apply_filters(self, queryset, form, selected_month):
        account = None
        category = None
        order_by = 'recent'

        queryset = queryset.filter(
            date__year=selected_month.year,
            date__month=selected_month.month,
        )

        if form.is_valid():
            account = form.cleaned_data.get('account')
            category = form.cleaned_data.get('category')
            order_by = form.cleaned_data.get('order_by') or order_by

        if account:
            queryset = queryset.filter(Q(account=account) | Q(destination_account=account))
        if category:
            queryset = queryset.filter(category=category)

        ordering_map = {
            'recent': ['-date', '-created_at'],
            'oldest': ['date', 'created_at'],
            'amount_desc': ['-amount', '-date'],
            'amount_asc': ['amount', '-date'],
            'pending': ['is_ignored', 'is_cleared', '-date'],
            'cleared': ['is_ignored', '-is_cleared', '-date'],
        }
        queryset = queryset.order_by(*ordering_map.get(order_by, ['-date', '-created_at']))

        return queryset

    def get_month_navigation(self, selected_month):
        selected_label = date_format(selected_month, "F Y").capitalize()
        prev_month = shift_month(selected_month, -1)
        next_month = shift_month(selected_month, 1)

        prev_params = self.request.GET.copy()
        prev_params["month"] = prev_month.strftime("%Y-%m")

        next_params = self.request.GET.copy()
        next_params["month"] = next_month.strftime("%Y-%m")

        return selected_label, prev_params.urlencode(), next_params.urlencode()

    def get_balance_cutoff_date(self, selected_month):
        next_month = shift_month(selected_month, 1)
        end_of_selected_month = next_month - timedelta(days=1)
        return end_of_selected_month

    def get_balances(self, form, selected_month):
        user = self.request.user
        tenant = self.request.tenant
        balance_cutoff_date = self.get_balance_cutoff_date(selected_month)
        current_balance = calculate_user_balance(user, balance_cutoff_date, tenant=tenant)

        account = None
        category = None
        if form.is_valid():
            account = form.cleaned_data.get("account")
            category = form.cleaned_data.get("category")

        monthly_balance = calculate_monthly_balance(
            user,
            selected_month,
            account=account,
            category=category,
            tenant=tenant,
        )

        credit_card_expenses = Transaction.objects.filter(
            tenant=tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            account__account_type=Account.AccountType.CARD,
            is_ignored=False,
            date__year=selected_month.year,
            date__month=selected_month.month,
        )
        if category:
            credit_card_expenses = credit_card_expenses.filter(category=category)

        credit_card_month_total = credit_card_expenses.aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]
        credit_card_open_total = credit_card_expenses.filter(is_cleared=False).aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]

        return current_balance, monthly_balance, credit_card_open_total, credit_card_month_total

    def get_filtered_transactions(self, form, selected_month):
        queryset = Transaction.objects.filter(tenant=self.request.tenant).select_related(
            "account", "destination_account", "category"
        )
        return self.apply_filters(queryset, form, selected_month)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        form = self.get_filter_form()
        selected_month, selected_month_value = self.get_selected_month()

        selected_month_label, prev_month_query, next_month_query = self.get_month_navigation(
            selected_month
        )
        transactions = self.get_filtered_transactions(form, selected_month)
        (
            current_balance,
            monthly_balance,
            credit_card_open_total,
            credit_card_month_total,
        ) = self.get_balances(form, selected_month)

        query_params = self.request.GET.copy()
        query_params["month"] = selected_month_value

        context["filter_form"] = form
        context["transactions"] = transactions
        context["querystring"] = query_params.urlencode()
        context["selected_month_value"] = selected_month_value
        context["selected_month_label"] = selected_month_label
        context["prev_month_query"] = prev_month_query
        context["next_month_query"] = next_month_query
        context["current_order"] = self.request.GET.get("order_by", "")
        context["selected_account_id"] = self.request.GET.get("account", "")
        context["selected_category_id"] = self.request.GET.get("category", "")
        context["today"] = timezone.localdate()
        context["current_balance"] = current_balance
        context["monthly_balance"] = monthly_balance

        monthly_transactions = Transaction.objects.filter(
            tenant=self.request.tenant,
            is_ignored=False,
            date__year=selected_month.year,
            date__month=selected_month.month,
        )
        context["monthly_income_total"] = monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.INCOME,
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        context["monthly_expense_total"] = monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE,
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

        credit_card_limit = calculate_credit_card_available_limit(self.request.tenant, selected_month)
        context["credit_card_expense_total"] = credit_card_open_total
        context["credit_card_open_total"] = credit_card_open_total
        context["credit_card_month_total"] = credit_card_month_total
        context["credit_card_limit"] = credit_card_limit
        consolidated_balance = monthly_balance + credit_card_limit
        context["consolidated_balance"] = consolidated_balance

        pending_base = Transaction.objects.filter(
            tenant=self.request.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_cleared=False,
            is_ignored=False,
            date__year=selected_month.year,
            date__month=selected_month.month,
        )
        pending_expense_total = pending_base.aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]
        pending_bank_total = pending_base.exclude(
            account__account_type=Account.AccountType.CARD
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        context["pending_bank_total"] = pending_bank_total
        context["balance_after_pending"] = consolidated_balance - pending_bank_total
        context["statement_return_url"] = (
            f"{reverse('transactions:statement')}?{query_params.urlencode()}"
        )
        return context


class StatementView(StatementViewBase):
    template_name = "transactions/statement.html"


class StatementPartialView(StatementViewBase):
    template_name = "transactions/partials/statement_list.html"


class StatementBalancePartialView(StatementViewBase):
    template_name = "transactions/partials/statement_balance.html"


class TransactionToggleClearedView(LoginRequiredMixin, MonthLockMixin, View):
    success_url = reverse_lazy("transactions:statement")
    modal_template_name = "transactions/partials/clear_transaction_modal.html"

    def _resolve_next_url(self, request):
        next_url = request.POST.get("next") or request.GET.get("next") or ""
        return resolve_safe_redirect_url(
            request,
            next_url,
            self.success_url,
            replacements=(("/transactions/partial/", "/transactions/"),),
        )

    def get(self, request, *args, **kwargs):
        tx = get_object_or_404(Transaction, pk=kwargs.get("pk"), tenant=request.tenant)
        return render(
            request,
            self.modal_template_name,
            {
                "transaction": tx,
                "next_url": self._resolve_next_url(request),
                "today": timezone.localdate(),
            },
        )

    def post(self, request, *args, **kwargs):
        tx = get_object_or_404(Transaction, pk=kwargs.get("pk"), tenant=request.tenant)

        if tx.is_cleared:
            tx.is_cleared = False
            tx.save(update_fields=["is_cleared", "updated_at"])
        else:
            raw_cleared_date = (request.POST.get("cleared_date") or "").strip()
            try:
                year, month, day = raw_cleared_date.split("-")
                cleared_date = date(int(year), int(month), int(day))
            except (TypeError, ValueError):
                cleared_date = None

            if cleared_date is None:
                messages.error(request, "Informe uma data valida para baixar a transacao.")
                next_url = self._resolve_next_url(request)
                if request.headers.get("HX-Request") == "true":
                    response = HttpResponse(status=204)
                    response["HX-Redirect"] = next_url
                    return response
                return HttpResponseRedirect(next_url)

            if self.is_month_closed(cleared_date) and not self.is_unlock_password_valid():
                messages.error(request, self.closed_month_error)
                next_url = self._resolve_next_url(request)
                if request.headers.get("HX-Request") == "true":
                    response = HttpResponse(status=204)
                    response["HX-Redirect"] = next_url
                    return response
                return HttpResponseRedirect(next_url)

            tx.date = cleared_date
            tx.is_cleared = True
            tx.is_ignored = False
            tx.save(update_fields=["date", "is_cleared", "is_ignored", "updated_at"])

        next_url = self._resolve_next_url(request)
        if request.headers.get("HX-Request") == "true":
            response = HttpResponse(status=204)
            if request.POST.get("modal") == "1":
                response["HX-Trigger"] = json.dumps(
                    {"closeModal": True, "transactionUpdated": {"id": tx.pk}}
                )
            else:
                response["HX-Redirect"] = next_url
            return response

        return HttpResponseRedirect(next_url)


class TransactionToggleIgnoredView(LoginRequiredMixin, View):
    success_url = reverse_lazy("transactions:statement")

    def _resolve_next_url(self, request):
        next_url = request.POST.get("next") or request.GET.get("next") or ""
        return resolve_safe_redirect_url(
            request,
            next_url,
            self.success_url,
            replacements=(("/transactions/partial/", "/transactions/"),),
        )

    def post(self, request, *args, **kwargs):
        tx = get_object_or_404(Transaction, pk=kwargs.get("pk"), tenant=request.tenant)

        tx.is_ignored = not tx.is_ignored
        if tx.is_ignored:
            tx.is_cleared = False
        tx.save(update_fields=["is_ignored", "is_cleared", "updated_at"])

        next_url = self._resolve_next_url(request)
        if request.headers.get("HX-Request") == "true":
            response = HttpResponse(status=204)
            response["HX-Redirect"] = next_url
            return response

        return HttpResponseRedirect(next_url)

class QuickTransactionCreateView(
    MonthLockMixin,
    LoginRequiredMixin,
    TransactionFormKwargsMixin,
    CreateView,
):
    model = Transaction
    form_class = QuickTransactionForm
    template_name = "transactions/partials/quick_add_modal.html"

    def form_valid(self, form):
        form.instance.user = self.request.user
        form.instance.tenant = self.request.tenant
        self.object = form.save()
        if self.object.recurrence_type != Transaction.RecurrenceType.ONCE:
            self.object.generate_future_occurrences()
        response = HttpResponse(status=204)
        response["HX-Trigger"] = json.dumps(
            {"transactionAdded": {"id": self.object.id}, "closeModal": True}
        )
        return response

    def form_invalid(self, form):
        return self.render_to_response(self.get_context_data(form=form))













