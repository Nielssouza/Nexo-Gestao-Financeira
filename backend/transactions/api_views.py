from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api_mixins import TenantQuerySetMixin
from transactions.models import ClosedMonth, Transaction
from transactions.serializers import ClosedMonthSerializer, TransactionSerializer


class TransactionViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related(
        "account", "destination_account", "category"
    ).all()
    serializer_class = TransactionSerializer
    search_fields = ("description",)
    filterset_fields = {
        "transaction_type": ["exact"],
        "account": ["exact"],
        "category": ["exact"],
        "is_cleared": ["exact"],
        "is_ignored": ["exact"],
        "date": ["exact", "gte", "lte"],
        "recurrence_type": ["exact"],
    }
    ordering_fields = ("date", "amount", "created_at")
    ordering = ("-date", "-created_at")

    def _is_month_closed(self, target_date):
        return ClosedMonth.objects.filter(
            tenant=self.get_tenant(),
            is_closed=True,
            year=target_date.year,
            month=target_date.month,
        ).exists()

    def _check_month_lock(self, target_date, unlock_password):
        if not self._is_month_closed(target_date):
            return True
        if unlock_password and self.request.user.check_password(unlock_password):
            return True
        return False

    def _get_related_occurrences_queryset(self, reference_transaction):
        return Transaction.objects.filter(
            tenant=self.get_tenant(),
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
        ).exclude(pk=reference_transaction.pk)

    def perform_create(self, serializer):
        unlock_password = serializer.validated_data.pop("unlock_password", None)
        serializer.validated_data.pop("scope", None)
        target_date = serializer.validated_data.get("date")

        if target_date and not self._check_month_lock(target_date, unlock_password):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Mês fechado: informe sua senha para confirmar esta alteração."})

        transaction = serializer.save(user=self.request.user, tenant=self.get_tenant())
        if transaction.recurrence_type != Transaction.RecurrenceType.ONCE:
            transaction.generate_future_occurrences()

    def perform_update(self, serializer):
        unlock_password = serializer.validated_data.pop("unlock_password", None)
        scope = serializer.validated_data.pop("scope", "current")
        
        old_instance = self.get_object()
        new_date = serializer.validated_data.get("date", old_instance.date)

        if not self._check_month_lock(old_instance.date, unlock_password) or not self._check_month_lock(new_date, unlock_password):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Mês fechado: informe sua senha para confirmar esta alteração."})

        transaction = serializer.save()

        if scope == "all":
            from django.db.models import F
            update_payload = {
                "transaction_type": transaction.transaction_type,
                "amount": transaction.amount,
                "account": transaction.account,
                "destination_account": transaction.destination_account,
                "category": transaction.category,
                "description": transaction.description,
                "recurrence_type": transaction.recurrence_type,
                "recurrence_interval": transaction.recurrence_interval,
                "recurrence_interval_unit": transaction.recurrence_interval_unit,
                "installment_count": transaction.installment_count,
            }
            if transaction.recurrence_type == Transaction.RecurrenceType.INSTALLMENT:
                update_payload["installment_number"] = F("installment_number")
            else:
                update_payload["installment_number"] = None
            
            self._get_related_occurrences_queryset(old_instance).update(**update_payload)

    def perform_destroy(self, instance):
        unlock_password = self.request.data.get("unlock_password", "")
        scope = self.request.data.get("scope", "current")

        if not self._check_month_lock(instance.date, unlock_password):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Mês fechado: informe sua senha para confirmar esta alteração."})

        if instance.is_cleared:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Lançamentos baixados não podem ser excluídos."})

        if scope == "all":
            self._get_related_occurrences_queryset(instance).delete()
            
        instance.delete()

    @action(detail=True, methods=["post"])
    def generate_occurrences(self, request, pk=None):
        """Trigger future occurrence generation for a recurring transaction."""
        transaction = self.get_object()
        count = transaction.generate_future_occurrences()
        return Response(
            {"generated": count},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def toggle_cleared(self, request, pk=None):
        """Toggle the is_cleared status of a transaction."""
        transaction = self.get_object()
        from transactions.serializers import TransactionToggleClearedSerializer
        serializer = TransactionToggleClearedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        unlock_password = serializer.validated_data.get("unlock_password", "")
        cleared_date = serializer.validated_data.get("cleared_date", None)

        if transaction.is_cleared:
            transaction.is_cleared = False
            transaction.save(update_fields=["is_cleared", "updated_at"])
        else:
            if cleared_date is None:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"detail": "Informe uma data válida para baixar a transação."})

            if not self._check_month_lock(cleared_date, unlock_password):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"detail": "Mês fechado: informe sua senha para confirmar esta alteração."})

            transaction.date = cleared_date
            transaction.is_cleared = True
            transaction.is_ignored = False
            transaction.save(update_fields=["date", "is_cleared", "is_ignored", "updated_at"])

        from transactions.serializers import TransactionSerializer
        return Response(
            TransactionSerializer(transaction).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def toggle_ignored(self, request, pk=None):
        """Toggle the is_ignored status of a transaction (mirrors TransactionToggleIgnoredView)."""
        transaction = self.get_object()
        transaction.is_ignored = not transaction.is_ignored
        if transaction.is_ignored:
            transaction.is_cleared = False
        transaction.save(update_fields=["is_ignored", "is_cleared", "updated_at"])
        return Response(
            TransactionSerializer(transaction).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def statement_summary(self, request):
        """Returns statement balances and totals for the selected month and filters."""
        from datetime import timedelta
        from decimal import Decimal
        from django.db.models import Sum
        from django.db.models.functions import Coalesce
        from django.utils import timezone
        from accounts.models import Account
        from common.balance import (
            calculate_credit_card_available_limit,
            calculate_monthly_balance,
            calculate_user_balance,
        )
        from common.months import month_value_to_date, shift_month

        selected_month_value = request.query_params.get("month", "")
        selected_month = month_value_to_date(selected_month_value)
        if not selected_month:
            selected_month = timezone.localdate().replace(day=1)
        
        tenant = self.get_tenant()
        user = request.user
        
        account_id = request.query_params.get("account")
        category_id = request.query_params.get("category")

        next_month = shift_month(selected_month, 1)
        balance_cutoff_date = next_month - timedelta(days=1)
        
        current_balance = calculate_user_balance(user, balance_cutoff_date, tenant=tenant)
        monthly_balance = calculate_monthly_balance(
            user,
            selected_month,
            account=account_id,
            category=category_id,
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
        if category_id:
            credit_card_expenses = credit_card_expenses.filter(category=category_id)

        credit_card_month_total = credit_card_expenses.aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]
        credit_card_open_total = credit_card_expenses.filter(is_cleared=False).aggregate(
            total=Coalesce(Sum("amount"), Decimal("0.00"))
        )["total"]

        credit_card_limit = calculate_credit_card_available_limit(tenant, selected_month)
        safe_credit_limit = credit_card_limit if credit_card_limit is not None else Decimal("0.00")
        consolidated_balance = monthly_balance + safe_credit_limit

        pending_base = Transaction.objects.filter(
            tenant=tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_cleared=False,
            is_ignored=False,
            date__year=selected_month.year,
            date__month=selected_month.month,
        )
        pending_bank_total = pending_base.exclude(
            account__account_type=Account.AccountType.CARD
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

        monthly_transactions = Transaction.objects.filter(
            tenant=tenant,
            is_ignored=False,
            date__year=selected_month.year,
            date__month=selected_month.month,
        )
        monthly_income_total = monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.INCOME,
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        monthly_expense_total = monthly_transactions.filter(
            transaction_type=Transaction.TransactionType.EXPENSE,
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

        return Response({
            "current_balance": str(current_balance),
            "monthly_balance": str(monthly_balance),
            "credit_card_open_total": str(credit_card_open_total),
            "credit_card_month_total": str(credit_card_month_total),
            "credit_card_limit": str(safe_credit_limit),
            "consolidated_balance": str(consolidated_balance),
            "pending_bank_total": str(pending_bank_total),
            "monthly_income_total": str(monthly_income_total),
            "monthly_expense_total": str(monthly_expense_total),
        })

class ClosedMonthViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ClosedMonth.objects.all()
    serializer_class = ClosedMonthSerializer
    filterset_fields = ("year", "month", "is_closed")
    ordering = ("-year", "-month")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())
