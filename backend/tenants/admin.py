from django.contrib import admin

from tenants.models import Tenant, TenantCompany, TenantCompanyAccess, TenantMembership


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "owner", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug", "owner__username")


@admin.register(TenantCompany)
class TenantCompanyAdmin(admin.ModelAdmin):
    list_display = ("sequence_number", "name", "tenant", "document", "is_default", "is_active")
    list_filter = ("is_default", "is_active")
    search_fields = ("sequence_number", "name", "document", "tenant__name")


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    list_display = ("tenant", "user", "role", "is_default", "created_at")
    list_filter = ("role", "is_default")
    search_fields = ("tenant__name", "user__username")


@admin.register(TenantCompanyAccess)
class TenantCompanyAccessAdmin(admin.ModelAdmin):
    list_display = ("membership", "company", "created_at")
    search_fields = ("membership__tenant__name", "membership__user__username", "membership__user__email", "company__name", "company__document")
