from rest_framework import serializers

from tenants.models import NfseCredential, Tenant, TenantMembership


class TenantSerializer(serializers.ModelSerializer):
    formatted_address_line = serializers.CharField(read_only=True)
    formatted_city_state = serializers.CharField(read_only=True)
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = Tenant
        fields = (
            "id",
            "name",
            "slug",
            "document",
            "email",
            "phone",
            "address",
            "address_number",
            "address_complement",
            "district",
            "city",
            "state",
            "postal_code",
            "logo",
            "formatted_address_line",
            "formatted_city_state",
            "full_address",
            "is_active",
            "default_interface",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "slug",
            "formatted_address_line",
            "formatted_city_state",
            "full_address",
            "is_active",
            "created_at",
            "updated_at",
        )


class TenantMembershipSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)

    class Meta:
        model = TenantMembership
        fields = ("id", "tenant", "tenant_name", "role", "is_default", "created_at", "updated_at")
        read_only_fields = ("id", "tenant", "role", "created_at", "updated_at")


class NfseCredentialSerializer(serializers.ModelSerializer):
    """
    Aceita gov_br_password (plaintext, write-only) e criptografa antes de salvar.
    Nunca expõe gov_br_password_enc na resposta — apenas has_password (bool).
    Espelho de NfseCredentialView.post() do SSR.
    """
    gov_br_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    has_password = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = NfseCredential
        fields = ("id", "tenant", "gov_br_cpf", "gov_br_password", "has_password", "updated_at")
        read_only_fields = ("id", "tenant", "has_password", "updated_at")

    def get_has_password(self, obj):
        return bool(obj.gov_br_password_enc)

    def _encrypt_and_set(self, instance, password):
        if password:
            from invoices.nfse_crypto import encrypt_password
            instance.gov_br_password_enc = encrypt_password(password)
            instance.save(update_fields=["gov_br_password_enc", "updated_at"])

    def create(self, validated_data):
        password = validated_data.pop("gov_br_password", None)
        validated_data.setdefault("gov_br_password_enc", "")
        instance = super().create(validated_data)
        self._encrypt_and_set(instance, password)
        return instance

    def update(self, instance, validated_data):
        password = validated_data.pop("gov_br_password", None)
        instance = super().update(instance, validated_data)
        self._encrypt_and_set(instance, password)
        return instance
