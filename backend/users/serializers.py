import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers

from tenants.models import Tenant, TenantMembership
from tenants.services import ensure_default_tenant_company

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Read-only serializer for the authenticated user profile."""

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "is_superuser")
        read_only_fields = fields


class PendingUserSerializer(serializers.ModelSerializer):
    """Serializer for pending users — includes tenant info for the approval screen."""

    tenant_name = serializers.SerializerMethodField()
    person_type = serializers.SerializerMethodField()
    person_type_display = serializers.SerializerMethodField()
    document = serializers.SerializerMethodField()
    date_joined = serializers.DateTimeField(format="%Y-%m-%dT%H:%M:%S")

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "date_joined", "tenant_name", "person_type", "person_type_display", "document",
        )
        read_only_fields = fields

    def _membership(self, user):
        return (
            user.tenant_memberships.select_related("tenant")
            .order_by("id")
            .first()
        )

    def get_tenant_name(self, user):
        m = self._membership(user)
        return m.tenant.name if m else None

    def get_person_type(self, user):
        m = self._membership(user)
        return m.tenant.person_type if m else None

    def get_person_type_display(self, user):
        m = self._membership(user)
        return m.tenant.get_person_type_display() if m else None

    def get_document(self, user):
        m = self._membership(user)
        return m.tenant.document if m else None


def _clean_doc(value: str) -> str:
    return re.sub(r"\D", "", value)


def _build_slug(name: str, document: str) -> str:
    base = slugify(name)[:80] or f"tenant-{document[-4:]}"
    slug = base
    counter = 1
    while Tenant.objects.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


class RegisterSerializer(serializers.Serializer):
    """
    Public registration with PF/PJ type and CPF/CNPJ document.
    Each CPF/CNPJ can only have one registration — duplicate documents are rejected.
    User is created with is_active=False — activation requires superuser approval.
    """

    person_type = serializers.ChoiceField(choices=["pf", "pj"])
    name = serializers.CharField(max_length=200)
    document = serializers.CharField(max_length=18)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("Este e-mail já está cadastrado.")
        return value.lower()

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "As senhas não coincidem."})

        doc = _clean_doc(attrs["document"])
        if attrs["person_type"] == "pf" and len(doc) != 11:
            raise serializers.ValidationError({"document": "CPF deve ter 11 dígitos."})
        if attrs["person_type"] == "pj" and len(doc) != 14:
            raise serializers.ValidationError({"document": "CNPJ deve ter 14 dígitos."})
        if Tenant.objects.filter(document=doc).exists():
            label = "CPF" if attrs["person_type"] == "pf" else "CNPJ"
            raise serializers.ValidationError({"document": f"Este {label} já possui um cadastro."})
        attrs["document"] = doc
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        person_type = validated_data["person_type"]
        document = validated_data["document"]
        name = validated_data["name"]
        email = validated_data["email"]
        password = validated_data["password"]

        base_username = email.split("@")[0][:140]
        username = base_username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}-{counter}"
            counter += 1

        if person_type == "pf":
            parts = name.split()
            first_name = parts[0][:150]
            last_name = " ".join(parts[1:])[:150]
        else:
            first_name = name[:150]
            last_name = ""

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
            is_active=False,
        )

        tenant = Tenant.objects.create(
            name=name,
            slug=_build_slug(name, document),
            owner=user,
            document=document,
            person_type=person_type,
        )
        ensure_default_tenant_company(tenant)

        TenantMembership.objects.filter(user=user, is_default=True).update(is_default=False)
        TenantMembership.objects.update_or_create(
            tenant=tenant,
            user=user,
            defaults={
                "role": TenantMembership.Role.OWNER,
                "is_default": True,
            },
        )

        return user
