from rest_framework import serializers

from transactions.models import ClosedMonth, Transaction


class TransactionSerializer(serializers.ModelSerializer):
    display_title = serializers.CharField(read_only=True)
    category_name = serializers.CharField(
        source="category.name", read_only=True, default=""
    )
    account_name = serializers.CharField(
        source="account.name", read_only=True
    )
    destination_account_name = serializers.CharField(
        source="destination_account.name", read_only=True, default=""
    )

    # Write-only control fields for compatibility with classic views
    unlock_password = serializers.CharField(write_only=True, required=False)
    scope = serializers.ChoiceField(
        choices=["current", "all"], write_only=True, required=False, default="current"
    )

    class Meta:
        model = Transaction
        fields = (
            "id",
            "transaction_type",
            "amount",
            "date",
            "account",
            "account_name",
            "destination_account",
            "destination_account_name",
            "category",
            "category_name",
            "description",
            "is_cleared",
            "is_ignored",
            "recurrence_type",
            "recurrence_interval",
            "recurrence_interval_unit",
            "installment_count",
            "installment_number",
            "display_title",
            "unlock_password",
            "scope",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "display_title",
            "installment_number",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        """Reuse the model's clean() logic for validation."""
        instance = Transaction(**{k: v for k, v in attrs.items() if k not in ("unlock_password", "scope")})
        # Assign user/tenant from the view context for validation
        request = self.context.get("request")
        if request:
            instance.user = request.user
            from common.api_mixins import get_user_tenant
            instance.tenant = get_user_tenant(request.user, request)
        instance.clean()
        return attrs

class TransactionToggleClearedSerializer(serializers.Serializer):
    """Serializer for the toggle_cleared action with custom date support."""
    cleared_date = serializers.DateField(required=False)
    unlock_password = serializers.CharField(write_only=True, required=False)


class ClosedMonthSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClosedMonth
        fields = ("id", "year", "month", "is_closed", "closed_at", "updated_at")
        read_only_fields = ("id", "closed_at", "updated_at")
