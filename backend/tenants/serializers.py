import re

from django.contrib.auth import get_user_model

from rest_framework import serializers

from tenants.models import NfseCredential, Tenant, TenantCompany, TenantMembership

_LOGO_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_LOGO_ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


def validate_logo_file(file):
    if file is None:
        return file
    ext = (file.name.rsplit(".", 1)[-1].lower()) if "." in file.name else ""
    if ext not in _LOGO_ALLOWED_EXTENSIONS:
        raise serializers.ValidationError(
            f"Formato não permitido. Use: {', '.join(sorted(_LOGO_ALLOWED_EXTENSIONS))}."
        )
    if file.size > _LOGO_MAX_BYTES:
        raise serializers.ValidationError("A logo deve ter no máximo 5 MB.")
    return file


class TenantSerializer(serializers.ModelSerializer):
    formatted_address_line = serializers.CharField(read_only=True)
    formatted_city_state = serializers.CharField(read_only=True)
    full_address = serializers.CharField(read_only=True)
    logo = serializers.ImageField(required=False, allow_null=True, validators=[validate_logo_file])

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
            "person_type",
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
            "person_type",
            "formatted_address_line",
            "formatted_city_state",
            "full_address",
            "is_active",
            "created_at",
            "updated_at",
        )


class TenantCompanySerializer(serializers.ModelSerializer):
    formatted_address_line = serializers.CharField(read_only=True)
    formatted_city_state = serializers.CharField(read_only=True)
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = TenantCompany
        fields = (
            "id",
            "tenant",
            "name",
            "document",
            "sequence_number",
            "email",
            "phone",
            "address",
            "address_number",
            "address_complement",
            "district",
            "city",
            "state",
            "postal_code",
            "formatted_address_line",
            "formatted_city_state",
            "full_address",
            "is_default",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "tenant",
            "formatted_address_line",
            "formatted_city_state",
            "full_address",
            "created_at",
            "updated_at",
        )

    def validate_sequence_number(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Informe apenas numeros.")
        return value

    def validate_document(self, value):
        digits = re.sub(r"\D", "", value or "")
        if not digits:
            return ""
        if len(digits) not in (11, 14):
            raise serializers.ValidationError("Informe um CPF com 11 digitos ou CNPJ com 14 digitos.")
        return digits

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("is_default") is True:
            attrs["is_active"] = True
        return attrs


class TenantMembershipSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    allowed_company_ids = serializers.SerializerMethodField()

    class Meta:
        model = TenantMembership
        fields = (
            "id",
            "tenant",
            "tenant_name",
            "user",
            "user_email",
            "user_username",
            "user_full_name",
            "role",
            "is_default",
            "allowed_company_ids",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "tenant",
            "user_email",
            "user_username",
            "user_full_name",
            "allowed_company_ids",
            "created_at",
            "updated_at",
        )

    def get_user_full_name(self, obj):
        name = obj.user.get_full_name().strip()
        return name or obj.user.email or obj.user.username

    def get_allowed_company_ids(self, obj):
        if obj.role in (TenantMembership.Role.OWNER, TenantMembership.Role.ADMIN):
            return list(obj.tenant.companies.filter(is_active=True).values_list("id", flat=True))
        return list(obj.company_accesses.values_list("company_id", flat=True))


class TenantMemberUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=300)
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=(
            TenantMembership.Role.OWNER,
            TenantMembership.Role.ADMIN,
            TenantMembership.Role.MEMBER,
        )
    )
    password = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        User = get_user_model()
        membership: TenantMembership = self.context["membership"]
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exclude(pk=membership.user_id).exists():
            raise serializers.ValidationError("Ja existe um usuario com este e-mail.")
        return email

    def validate(self, attrs):
        password = attrs.get("password", "")
        if password and len(password) < 6:
            raise serializers.ValidationError({"password": "A senha deve ter no minimo 6 caracteres."})
        return attrs


class NfseCredentialSerializer(serializers.ModelSerializer):
    """
    Aceita gov_br_password (plaintext, write-only) e criptografa antes de salvar.
    Nunca expõe gov_br_password_enc na resposta — apenas has_password (bool).
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
