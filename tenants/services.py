from django.db import transaction
from django.utils.text import slugify

from tenants.models import Tenant, TenantMembership


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


@transaction.atomic
def create_personal_tenant_for_user(user):
    tenant_name = build_default_tenant_name(user)
    tenant = Tenant.objects.create(
        name=tenant_name,
        slug=build_unique_tenant_slug(tenant_name, fallback_suffix=user.pk),
        owner=user,
    )
    TenantMembership.objects.create(
        tenant=tenant,
        user=user,
        role=TenantMembership.Role.OWNER,
        is_default=True,
    )
    return tenant


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

    return create_personal_tenant_for_user(user)


def get_active_tenant_for_user(user, tenant_id=None):
    memberships = TenantMembership.objects.select_related("tenant").filter(
        user=user,
        tenant__is_active=True,
    )
    if tenant_id:
        selected = memberships.filter(tenant_id=tenant_id).first()
        if selected:
            return selected.tenant

    selected = memberships.filter(is_default=True).first()
    if selected:
        return selected.tenant

    return ensure_user_has_tenant(user)


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
