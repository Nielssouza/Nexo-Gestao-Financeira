from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api_mixins import TenantQuerySetMixin
from shopping.models import ShoppingItem, ShoppingList
from shopping.serializers import (
    ShoppingItemSerializer,
    ShoppingListSerializer,
    ShoppingListSummarySerializer,
)


class ShoppingListViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ShoppingList.objects.prefetch_related("items").all()
    search_fields = ("name",)
    ordering_fields = ("name", "list_date", "updated_at")
    ordering = ("-updated_at",)

    def get_serializer_class(self):
        if self.action == "list":
            return ShoppingListSummarySerializer
        return ShoppingListSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Global shopping stats across all lists (mirrors ShoppingListView.get_context_data)."""
        tenant = self.get_tenant()
        items_qs = ShoppingItem.objects.filter(tenant=tenant)
        purchased_qs = items_qs.filter(is_purchased=True)

        total_expr = ExpressionWrapper(
            Coalesce(F("unit_price"), Value(Decimal("0.00"))) * F("quantity"),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        )
        purchased_total = purchased_qs.aggregate(
            total=Coalesce(Sum(total_expr), Decimal("0.00"))
        )["total"]

        return Response({
            "total_lists": ShoppingList.objects.filter(tenant=tenant).count(),
            "pending_count": items_qs.filter(is_purchased=False).count(),
            "purchased_count": purchased_qs.count(),
            "purchased_total": str(purchased_total),
        })


class ShoppingItemViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = ShoppingItem.objects.all()
    serializer_class = ShoppingItemSerializer
    filterset_fields = ("shopping_list", "is_purchased")
    search_fields = ("title",)
    ordering_fields = ("title", "created_at")
    ordering = ("is_purchased", "-updated_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())

    @action(detail=True, methods=["post"])
    def toggle_purchased(self, request, pk=None):
        """Toggle purchased status of a shopping item (mirrors ShoppingItemTogglePurchasedView)."""
        item = self.get_object()
        item.toggle_purchased()
        item.save(update_fields=["is_purchased", "purchased_at", "updated_at"])
        return Response(
            ShoppingItemSerializer(item).data,
            status=status.HTTP_200_OK,
        )
