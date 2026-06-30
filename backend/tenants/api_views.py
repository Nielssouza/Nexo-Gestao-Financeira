import json
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from rest_framework import generics, parsers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api_mixins import get_user_tenant
from common.throttles import CepLookupThrottle
from tenants.models import NfseCredential, TenantCompany, TenantCompanyAccess, TenantMembership
from tenants.serializers import (
    NfseCredentialSerializer,
    TenantCompanySerializer,
    TenantMemberUpdateSerializer,
    TenantMembershipSerializer,
    TenantSerializer,
)
from tenants.services import ensure_default_tenant_company


def get_tenant_membership(user, tenant):
    return TenantMembership.objects.filter(user=user, tenant=tenant).first()


def is_tenant_admin(user, tenant):
    if user.is_superuser:
        return True
    membership = get_tenant_membership(user, tenant)
    return bool(
        membership and membership.role in (TenantMembership.Role.OWNER, TenantMembership.Role.ADMIN)
    )


def require_tenant_admin(user, tenant):
    if not is_tenant_admin(user, tenant):
        raise PermissionDenied("Apenas administradores do tenant podem executar esta acao.")


class TenantProfileView(generics.RetrieveUpdateAPIView):
    """
    Retrieve and update the authenticated user's tenant profile.
    Supports multipart/form-data for logo uploads.
    Send clear_logo=true to remove the current logo.
    """
    serializer_class = TenantSerializer
    parser_classes = [parsers.MultiPartParser, parsers.JSONParser]

    def get_object(self):
        tenant = get_user_tenant(self.request.user, self.request)
        ensure_default_tenant_company(tenant)
        return tenant

    def perform_update(self, serializer):
        clear_logo = self.request.data.get("clear_logo") in ("true", "1", True, "True")
        if clear_logo:
            serializer.save(logo=None)
        else:
            serializer.save()


class TenantMembershipViewSet(generics.ListCreateAPIView, viewsets.GenericViewSet):
    """List and create tenant memberships."""
    serializer_class = TenantMembershipSerializer

    def get_queryset(self):
        tenant = get_user_tenant(self.request.user, self.request)
        require_tenant_admin(self.request.user, tenant)
        return (
            TenantMembership.objects
            .filter(tenant=tenant)
            .select_related("tenant", "user")
            .prefetch_related("company_accesses", "tenant__companies")
        )

    def perform_create(self, serializer):
        tenant = get_user_tenant(self.request.user, self.request)
        require_tenant_admin(self.request.user, tenant)
        serializer.save(tenant=tenant)

    @action(detail=True, methods=["patch"], url_path="member")
    def member(self, request, pk=None):
        tenant = get_user_tenant(request.user, request)
        require_tenant_admin(request.user, tenant)
        membership = self.get_object()

        if membership.tenant_id != tenant.pk:
            raise PermissionDenied("Usuario nao pertence a este tenant.")

        serializer = TenantMemberUpdateSerializer(
            data=request.data,
            context={"request": request, "membership": membership},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = membership.user
        parts = data["name"].strip().split()
        user.first_name = parts[0][:150] if parts else ""
        user.last_name = " ".join(parts[1:])[:150]
        user.email = data["email"]
        password = data.get("password", "")
        if password:
            user.set_password(password)
        update_fields = ["first_name", "last_name", "email"]
        if password:
            update_fields.append("password")
        user.save(update_fields=update_fields)

        membership.role = data["role"]
        membership.save(update_fields=["role", "updated_at"])

        return Response(self.get_serializer(membership).data)

    @action(detail=True, methods=["patch"], url_path="companies")
    def companies(self, request, pk=None):
        tenant = get_user_tenant(request.user, request)
        require_tenant_admin(request.user, tenant)
        membership = self.get_object()

        if membership.tenant_id != tenant.pk:
            raise PermissionDenied("Usuario nao pertence a este tenant.")
        if membership.role in (TenantMembership.Role.OWNER, TenantMembership.Role.ADMIN):
            return Response({
                "detail": "Owners e admins do tenant ja possuem acesso a todas as empresas."
            }, status=status.HTTP_400_BAD_REQUEST)

        raw_company_ids = request.data.get("company_ids", [])
        if not isinstance(raw_company_ids, list):
            return Response({"company_ids": "Informe uma lista de empresas."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            company_ids = [int(company_id) for company_id in raw_company_ids]
        except (TypeError, ValueError):
            return Response({"company_ids": "Informe apenas IDs numericos."}, status=status.HTTP_400_BAD_REQUEST)

        companies = list(TenantCompany.objects.filter(tenant=tenant, pk__in=company_ids, is_active=True))
        found_ids = {company.pk for company in companies}
        invalid_ids = [company_id for company_id in company_ids if company_id not in found_ids]
        if invalid_ids:
            return Response({"company_ids": "Uma ou mais empresas nao pertencem a este tenant."}, status=status.HTTP_400_BAD_REQUEST)

        TenantCompanyAccess.objects.filter(membership=membership).exclude(company_id__in=found_ids).delete()
        existing_ids = set(
            TenantCompanyAccess.objects.filter(membership=membership).values_list("company_id", flat=True)
        )
        TenantCompanyAccess.objects.bulk_create([
            TenantCompanyAccess(membership=membership, company=company)
            for company in companies
            if company.pk not in existing_ids
        ])

        serializer = self.get_serializer(membership)
        return Response(serializer.data)


class TenantCompanyViewSet(viewsets.ModelViewSet):
    """Manage companies that belong to the authenticated user's tenant."""
    serializer_class = TenantCompanySerializer
    ordering = ("sequence_number", "name")
    max_companies_per_tenant = 2

    def get_queryset(self):
        tenant = get_user_tenant(self.request.user, self.request)
        ensure_default_tenant_company(tenant)
        queryset = TenantCompany.objects.filter(tenant=tenant)
        if is_tenant_admin(self.request.user, tenant):
            return queryset
        membership = get_tenant_membership(self.request.user, tenant)
        if not membership:
            return queryset.none()
        return queryset.filter(membership_accesses__membership=membership).distinct()

    def perform_create(self, serializer):
        tenant = get_user_tenant(self.request.user, self.request)
        require_tenant_admin(self.request.user, tenant)
        if TenantCompany.objects.filter(tenant=tenant).count() >= self.max_companies_per_tenant:
            raise ValidationError({
                "detail": f"Este tenant permite no maximo {self.max_companies_per_tenant} cadastros de CPF/CNPJ."
            })
        if serializer.validated_data.get("is_default"):
            TenantCompany.objects.filter(tenant=tenant, is_default=True).update(is_default=False)
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        tenant = get_user_tenant(self.request.user, self.request)
        require_tenant_admin(self.request.user, tenant)
        if serializer.validated_data.get("is_default"):
            TenantCompany.objects.filter(tenant=tenant, is_default=True).exclude(
                pk=serializer.instance.pk
            ).update(is_default=False)
        serializer.save()

    def perform_destroy(self, instance):
        tenant = get_user_tenant(self.request.user, self.request)
        require_tenant_admin(self.request.user, tenant)
        instance.delete()


class NfseCredentialViewSet(viewsets.ModelViewSet):
    """
    Manage NFS-e gov.br credentials.
    Accepts gov_br_password as plaintext and encrypts it before saving.
    Never returns the encrypted password, only has_password.
    """
    serializer_class = NfseCredentialSerializer

    def get_queryset(self):
        return NfseCredential.objects.filter(tenant=get_user_tenant(self.request.user, self.request))

    def perform_create(self, serializer):
        serializer.save(tenant=get_user_tenant(self.request.user, self.request))


class TenantInviteUserView(APIView):
    """POST /api/v1/tenant/invite-user/ — owner/admin cria um usuário e o adiciona ao tenant."""

    def post(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        tenant = get_user_tenant(request.user, request)
        require_tenant_admin(request.user, tenant)

        name = (request.data.get("name") or "").strip()
        email = (request.data.get("email") or "").strip().lower()
        password = request.data.get("password") or ""
        role = request.data.get("role") or TenantMembership.Role.MEMBER

        if not name or not email or not password:
            return Response({"detail": "Nome, e-mail e senha são obrigatórios."}, status=status.HTTP_400_BAD_REQUEST)

        if len(password) < 6:
            return Response({"detail": "A senha deve ter no mínimo 6 caracteres."}, status=status.HTTP_400_BAD_REQUEST)

        if role not in (TenantMembership.Role.OWNER, TenantMembership.Role.ADMIN, TenantMembership.Role.MEMBER):
            return Response({"detail": "Papel inválido."}, status=status.HTTP_400_BAD_REQUEST)

        if TenantMembership.objects.filter(tenant=tenant).count() >= 5:
            return Response({"detail": "Limite de 5 usuários por tenant atingido."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return Response({"detail": "Já existe um usuário com este e-mail."}, status=status.HTTP_400_BAD_REQUEST)

        parts = name.split()
        first_name = parts[0][:150]
        last_name = " ".join(parts[1:])[:150]

        base_username = email.split("@")[0][:140]
        username = base_username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f"{base_username}-{counter}"
            counter += 1

        user = User.objects.create_user(
            username=username, email=email, password=password,
            first_name=first_name, last_name=last_name, is_active=True,
        )

        TenantMembership.objects.filter(user=user, is_default=True).update(is_default=False)
        membership = TenantMembership.objects.create(
            tenant=tenant, user=user, role=role, is_default=True,
        )

        return Response({
            "id": membership.pk,
            "user_email": user.email,
            "user_full_name": f"{user.first_name} {user.last_name}".strip(),
            "role": membership.role,
        }, status=status.HTTP_201_CREATED)


class CepLookupView(APIView):
    """GET /api/v1/cep/<cep>/ looks up an address by CEP through ViaCEP."""
    throttle_classes = [CepLookupThrottle]

    def get(self, request, cep):
        digits = "".join(c for c in cep if c.isdigit())
        if len(digits) != 8:
            return Response({"error": "CEP invalido."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with urlopen(f"https://viacep.com.br/ws/{digits}/json/", timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            return Response(
                {"error": "Nao foi possivel consultar o CEP."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if data.get("erro"):
            return Response({"error": "CEP nao encontrado."}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "address": data.get("logradouro", ""),
            "district": data.get("bairro", ""),
            "city": data.get("localidade", ""),
            "state": data.get("uf", ""),
            "postal_code": data.get("cep", ""),
            "complement": data.get("complemento", ""),
        })
