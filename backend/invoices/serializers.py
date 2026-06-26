from rest_framework import serializers

from invoices.models import Client, Invoice
from invoices.service_codes import SERVICE_CODES


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = (
            "id",
            "name",
            "document",
            "email",
            "phone",
            "address",
            "city",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class InvoiceSerializer(serializers.ModelSerializer):
    # Computed fields (read-only)
    number_display = serializers.CharField(read_only=True)
    calculation_base = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    iss_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    pis_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    cofins_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    csll_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    ir_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    inss_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    total_withheld = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    net_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    # Write-only control field
    launch_financial = serializers.BooleanField(
        write_only=True, required=False, default=False
    )
    save_client = serializers.BooleanField(
        write_only=True, required=False, default=False
    )

    # Related names
    expected_account_name = serializers.CharField(
        source="expected_account.name", read_only=True, default=""
    )
    service_code_description = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "number",
            "number_display",
            "status",
            "issue_date",
            "due_date",
            # Client info
            "client_name",
            "client_document",
            "client_email",
            "client_phone",
            "client_address",
            "client_city",
            # Service
            "service_code",
            "service_code_description",
            "service_description",
            # Values
            "gross_value",
            "deductions",
            "calculation_base",
            # Tax rates
            "iss_rate",
            "iss_withheld",
            "pis_rate",
            "cofins_rate",
            "csll_rate",
            "ir_rate",
            "inss_rate",
            # Computed taxes
            "iss_value",
            "pis_value",
            "cofins_value",
            "csll_value",
            "ir_value",
            "inss_value",
            "total_withheld",
            "net_value",
            # Recurrence
            "recurrence_type",
            "recurrence_interval",
            "recurrence_interval_unit",
            "installment_count",
            # Financial
            "expected_account",
            "expected_account_name",
            "launch_financial",
            "save_client",
            # NFS-e
            "nfse_status",
            "nfse_number",
            "nfse_error",
            "nfse_requested_at",
            # Payment
            "paid_at",
            "transaction",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "number",
            "number_display",
            "calculation_base",
            "iss_value",
            "pis_value",
            "cofins_value",
            "csll_value",
            "ir_value",
            "inss_value",
            "total_withheld",
            "net_value",
            "nfse_status",
            "nfse_number",
            "nfse_error",
            "nfse_requested_at",
            "paid_at",
            "transaction",
            "created_at",
            "updated_at",
        )

    def get_service_code_description(self, obj):
        return dict(SERVICE_CODES).get(obj.service_code, "")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        launch_financial = attrs.get("launch_financial", False)
        expected_account = attrs.get("expected_account")
        existing_account = getattr(self.instance, "expected_account", None)

        if launch_financial and expected_account is None and existing_account is None:
            raise serializers.ValidationError({
                "expected_account": "Selecione a conta para lancar a fatura automaticamente no financeiro."
            })

        return attrs


class InvoicePaySerializer(serializers.Serializer):
    """Serializer for the pay action."""
    paid_at = serializers.DateField()
    account = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID da conta para registrar o pagamento."
    )
    launch_financial = serializers.BooleanField(
        required=False, default=False
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("launch_financial") and not attrs.get("account"):
            raise serializers.ValidationError({
                "account": "Selecione a conta para registrar o recebimento."
            })
        return attrs
