"""API mixins for tenant-scoped ViewSets (DRF equivalent of UserQuerySetMixin)."""

from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from tenants.models import Tenant, TenantMembership


def get_user_tenant(user, request=None):
    """Resolve the active tenant for a JWT-authenticated user.

    For stateless JWT requests there is no session, so we resolve the
    tenant from the user's default TenantMembership.
    """
    requested_tenant_id = None
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
        return membership.tenant

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


def is_view_only_superuser(user, tenant):
    """True when a superuser is browsing a tenant they don't actually belong to.

    Superusers can open any tenant via X-Tenant-ID (see get_user_tenant above)
    to support the account, but must not see the tenant's real financial
    values unless they also hold a membership there.
    """
    if not tenant or not getattr(user, "is_superuser", False):
        return False
    return not TenantMembership.objects.filter(user=user, tenant=tenant).exists()


def set_mask_financial_values(request, masked):
    """Flag the request so FinancialMaskingMiddleware can blank monetary fields.

    DRF's Request proxies attribute *reads* to the underlying Django
    HttpRequest but not writes, and the masking middleware only ever sees
    that underlying HttpRequest — so the flag must be set there directly,
    not on the DRF Request wrapper.
    """
    getattr(request, "_request", request).mask_financial_values = masked


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
            tenant = get_user_tenant(self.request.user, self.request)
        else:
            tenant = getattr(self.request, "tenant", None) or get_user_tenant(self.request.user, self.request)

        set_mask_financial_values(self.request, is_view_only_superuser(self.request.user, tenant))
        return tenant

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(**{self.tenant_field: self.get_tenant()})

    def _content_hidden(self):
        """True once get_tenant() has run and flagged this as a view-only
        superuser request. Content (list/detail) must not be exposed then —
        only counts, so navigation and pagination keep working."""
        self.get_tenant()
        return bool(getattr(self.request, "mask_financial_values", False))

    def list(self, request, *args, **kwargs):
        if self._content_hidden():
            queryset = self.filter_queryset(self.get_queryset())
            page = self.paginate_queryset(queryset)
            if page is not None:
                return self.get_paginated_response([])
            return Response([])
        return super().list(request, *args, **kwargs)

    def get_object(self):
        # Every single-record path — retrieve(), update(), destroy(), and
        # custom @actions like pay/cancel/nfse_emit/add_entry/toggle — all
        # go through get_object(). Blocking it here (instead of only
        # retrieve()) closes those custom-action leaks in one place instead
        # of patching each action individually.
        if self._content_hidden():
            raise PermissionDenied("Conteúdo oculto no modo de visualização (superusuário).")
        return super().get_object()

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user,
            tenant=self.get_tenant(),
        )

    def perform_update(self, serializer):
        serializer.save()
