from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api_mixins import TenantQuerySetMixin
from investments.models import Investment, InvestmentEntry
from investments.serializers import (
    InvestmentEntrySerializer,
    InvestmentSerializer,
    InvestmentSummarySerializer,
)


class InvestmentViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Investment.objects.prefetch_related("entries").all()
    search_fields = ("name", "broker")
    filterset_fields = ("investment_type", "is_active")
    ordering_fields = ("name", "created_at")
    ordering = ("-is_active", "name")

    def get_serializer_class(self):
        if self.action == "list":
            return InvestmentSummarySerializer
        return InvestmentSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())

    @action(detail=True, methods=["post"])
    def add_entry(self, request, pk=None):
        """Add an InvestmentEntry inline (mirrors InvestmentDetailView.post)."""
        investment = self.get_object()
        data = {**request.data, "investment": investment.pk}
        serializer = InvestmentEntrySerializer(data=data)
        serializer.is_valid(raise_exception=True)
        entry = serializer.save(user=request.user, tenant=self.get_tenant())
        return Response(
            InvestmentEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )


class InvestmentEntryViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = InvestmentEntry.objects.select_related("investment").all()
    serializer_class = InvestmentEntrySerializer
    filterset_fields = ("investment", "entry_type")
    ordering_fields = ("date", "amount", "created_at")
    ordering = ("-date", "-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())
