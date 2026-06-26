from decimal import Decimal, InvalidOperation

from rest_framework import status, viewsets
from rest_framework.response import Response

from accounts.models import Account, CardMonthlyLimit
from accounts.serializers import AccountSerializer, CardMonthlyLimitSerializer
from common.api_mixins import TenantQuerySetMixin


class AccountViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    search_fields = ("name",)
    filterset_fields = ("account_type", "is_active", "include_in_balance")
    ordering_fields = ("name", "created_at")
    ordering = ("name",)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())


class CardMonthlyLimitViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = CardMonthlyLimit.objects.all()
    serializer_class = CardMonthlyLimitSerializer
    filterset_fields = ("account", "year", "month")
    ordering = ("-year", "-month")

    def create(self, request, *args, **kwargs):
        tenant = self.get_tenant()
        account_id = request.data.get("account")
        year = request.data.get("year")
        month = request.data.get("month")
        amount = request.data.get("amount")

        if not all([account_id, year, month, amount is not None]):
            return Response(
                {"detail": "account, year, month e amount são obrigatórios."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # IDOR guard: validate account belongs to the current tenant
        account = Account.objects.filter(pk=account_id, tenant=tenant).first()
        if account is None:
            return Response(
                {"detail": "Conta não encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            year = int(year)
            month = int(month)
            if not (1 <= month <= 12):
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {"detail": "year e month devem ser inteiros válidos (month: 1-12)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            amount = Decimal(str(amount))
            if amount < 0:
                raise ValueError
        except (InvalidOperation, ValueError):
            return Response(
                {"detail": "amount deve ser um valor decimal não-negativo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        instance, created = CardMonthlyLimit.objects.update_or_create(
            account=account,
            year=year,
            month=month,
            defaults={"amount": amount, "tenant": tenant},
        )

        return Response(
            self.get_serializer(instance).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
