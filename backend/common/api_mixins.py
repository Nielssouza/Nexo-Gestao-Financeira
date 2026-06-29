"""API mixins for tenant-scoped ViewSets (DRF equivalent of UserQuerySetMixin)."""

from rest_framework.exceptions import PermissionDenied

from tenants.models import Tenant, TenantMembership


def get_user_tenant(user, request=None):
    """Resolve the active tenant for a JWT-authenticated user.

    For stateless JWT requests there is no session, so we resolve the
    tenant from the user's default TenantMembership.
    """
    requested_tenant_id = None
    print(f"DEBUG: get_user_tenant called for user {user.pk}")
    if request is not None:
        requested_tenant_id = request.headers.get("X-Tenant-ID") or request.META.get("HTTP_X_TENANT_ID")

    if requested_tenant_id:
        try:
            requested_tenant_id = int(requested_tenant_id)
        except (ValueError, TypeError):
            raise PermissionDenied("X-Tenant-ID inválido.")
        tenant = Tenant.objects.filter(pk=requested_tenant_id, is_active=True).first()
        if not tenant:
            raise PermissionDenied("Tenant selecionado nao encontrado.")
        if getattr(user, "is_superuser", False):
            return tenant
        if TenantMembership.objects.filter(user=user, tenant=tenant, tenant__is_active=True).exists():
            return tenant
        raise PermissionDenied("Usuario sem acesso ao tenant selecionado.")

    membership = (
        TenantMembership.objects
        .select_related("tenant")
        .filter(user=user, is_default=True, tenant__is_active=True)
        .first()
    )
    if membership:
        print(f"DEBUG: Found default membership tenant {membership.tenant.pk}")
        return membership.tenant

    print("DEBUG: No default membership found")

    # Fallback: first active membership
    membership = (
        TenantMembership.objects
        .select_related("tenant")
        .filter(user=user, tenant__is_active=True)
        .order_by("id")
        .first()
    )
    if membership:
        return membership.tenant

    if getattr(user, 'is_superuser', False):
        return None

    raise PermissionDenied("Usuário não possui tenant ativo.")


class TenantQuerySetMixin:
    """Filter queryset by the authenticated user's tenant.

    Use this on ModelViewSets to enforce multi-tenant isolation.
    """

    tenant_field = "tenant"

    def get_tenant(self):
        # API requests are scoped by JWT plus X-Tenant-ID. Do not let a Django
        # session tenant override the stateless API tenant selection.
        requested_tenant_id = self.request.headers.get("X-Tenant-ID") or self.request.META.get("HTTP_X_TENANT_ID")
        if requested_tenant_id:
            return get_user_tenant(self.request.user, self.request)

        tenant = getattr(self.request, "tenant", None)
        if tenant:
            return tenant
        return get_user_tenant(self.request.user, self.request)

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(**{self.tenant_field: self.get_tenant()})

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user,
            tenant=self.get_tenant(),
        )

    def perform_update(self, serializer):
        serializer.save()
