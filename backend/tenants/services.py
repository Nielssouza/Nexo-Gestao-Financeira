import re

from django.db import transaction
from django.utils.text import slugify
from rest_framework.exceptions import PermissionDenied

from tenants.models import Tenant, TenantCompany, TenantMembership


def build_default_tenant_name(user):
    base_name = (getattr(user, "first_name", "") or "").strip()
    if base_name:
        return f"{base_name} Workspace"

    username = (getattr(user, "username", "") or "").strip()
    if username:
        return f"{username} Workspace"

    return f"Cliente {user.pk}"


def build_unique_tenant_slug(base_value, *, fallback_suffix):
    base_slug = slugify(base_value)[:110] or f"tenant-{fallback_suffix}"
    candidate = base_slug
    index = 2
    while Tenant.objects.filter(slug=candidate).exists():
        suffix = f"-{index}"
        candidate = f"{base_slug[: max(1, 140 - len(suffix))]}{suffix}"
        index += 1
    return candidate


def normalize_tenant_document(document):
    digits = re.sub(r"\D", "", document or "")
    if len(digits) not in (11, 14):
        raise PermissionDenied("Tenant sem CPF ou CNPJ valido.")
    return digits


def ensure_default_tenant_company(tenant):
    document = normalize_tenant_document(tenant.document)

    company = tenant.companies.filter(is_default=True).first()
    if company:
        if not company.document:
            company.document = document
            company.save(update_fields=["document", "updated_at"])
        return company

    company = tenant.companies.order_by("sequence_number", "id").first()
    if company:
        company.is_default = True
        company.is_active = True
        if not company.document:
            company.document = document
        company.save(update_fields=["is_default", "is_active", "document", "updated_at"])
        return company

    return TenantCompany.objects.create(
        tenant=tenant,
        name=tenant.name,
        document=document,
        sequence_number="1",
        email=tenant.email,
        phone=tenant.phone,
        address=tenant.address,
        address_number=tenant.address_number,
        address_complement=tenant.address_complement,
        district=tenant.district,
        city=tenant.city,
        state=tenant.state,
        postal_code=tenant.postal_code,
        is_default=True,
        is_active=True,
    )


@transaction.atomic
def ensure_user_has_tenant(user):
    membership = (
        TenantMembership.objects.select_related("tenant")
        .filter(user=user, is_default=True, tenant__is_active=True)
        .first()
    )
    if membership:
        return membership.tenant

    membership = (
        TenantMembership.objects.select_related("tenant")
        .filter(user=user, tenant__is_active=True)
        .order_by("id")
        .first()
    )
    if membership:
        TenantMembership.objects.filter(user=user, is_default=True).update(is_default=False)
        if not membership.is_default:
            membership.is_default = True
            membership.save(update_fields=["is_default", "updated_at"])
        return membership.tenant

    raise PermissionDenied("Usuario nao possui tenant ativo. Cadastre CPF ou CNPJ para criar um tenant.")


def get_request_tenant(request):
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return None

    tenant_id = request.session.get("active_tenant_id")

    memberships = TenantMembership.objects.select_related("tenant").filter(
        user=user,
        tenant__is_active=True,
    )

    if not memberships.exists():
        request.session.flush()
        return None

    if tenant_id:
        selected = memberships.filter(tenant_id=tenant_id).first()
        if selected:
            request.session["active_tenant_id"] = selected.tenant.pk
            return selected.tenant

    default = memberships.filter(is_default=True).first() or memberships.order_by("id").first()
    if default:
        request.session["active_tenant_id"] = default.tenant.pk
        return default.tenant

    return None
