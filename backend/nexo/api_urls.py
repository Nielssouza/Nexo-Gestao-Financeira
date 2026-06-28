"""API v1 URL configuration.

All endpoints are mounted under /api/v1/ by the main urls.py.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from users.api_views import CookieTokenRefreshView as TokenRefreshView

from accounts.api_views import AccountViewSet, CardMonthlyLimitViewSet
from categories.api_views import CategoryViewSet
from dashboard.api_views import DashboardView
from investments.api_views import InvestmentEntryViewSet, InvestmentViewSet
from invoices.api_views import ClientViewSet, InvoiceViewSet
from shopping.api_views import ShoppingItemViewSet, ShoppingListViewSet
from tenants.api_views import (
    CepLookupView,
    NfseCredentialViewSet,
    TenantCompanyViewSet,
    TenantInviteUserView,
    TenantMembershipViewSet,
    TenantProfileView,
)
from todos.api_views import TodoItemViewSet
from transactions.api_views import ClosedMonthViewSet, TransactionViewSet
from users.api_views import (
    ApproveUserView,
    LogoutView,
    MeView,
    PendingUsersView,
    RateLimitedTokenObtainPairView,
    RegisterAPIView,
    RestoreBackupView,
    SystemAllCompaniesView,
    SystemStatsView,
    SystemTenantsView,
    SystemUsersView,
)

router = DefaultRouter()
router.register("accounts", AccountViewSet)
router.register("card-limits", CardMonthlyLimitViewSet)
router.register("categories", CategoryViewSet)
router.register("transactions", TransactionViewSet)
router.register("closed-months", ClosedMonthViewSet)
router.register("invoices", InvoiceViewSet)
router.register("clients", ClientViewSet)
router.register("shopping-lists", ShoppingListViewSet)
router.register("shopping-items", ShoppingItemViewSet)
router.register("investments", InvestmentViewSet)
router.register("investment-entries", InvestmentEntryViewSet)
router.register("tenant-memberships", TenantMembershipViewSet, basename="tenant-membership")
router.register("tenant-companies", TenantCompanyViewSet, basename="tenant-company")
router.register("nfse-credentials", NfseCredentialViewSet, basename="nfse-credential")
router.register("todos", TodoItemViewSet, basename="todo")

app_name = "api"

urlpatterns = [
    # Auth
    path("auth/token/", RateLimitedTokenObtainPairView.as_view(), name="token_obtain"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/register/", RegisterAPIView.as_view(), name="register"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),

    # Current user
    path("me/", MeView.as_view(), name="me"),

    # User management (superuser only)
    path("users/pending/", PendingUsersView.as_view(), name="users_pending"),
    path("users/<int:pk>/approve/", ApproveUserView.as_view(), name="users_approve"),
    path("system/restore-backup/", RestoreBackupView.as_view(), name="restore_backup"),
    path("system/stats/", SystemStatsView.as_view(), name="system_stats"),
    path("system/tenants/", SystemTenantsView.as_view(), name="system_tenants"),
    path("system/users/", SystemUsersView.as_view(), name="system_users"),
    path("system/all-companies/", SystemAllCompaniesView.as_view(), name="system_all_companies"),

    # Dashboard
    path("dashboard/", DashboardView.as_view(), name="dashboard"),

    # Tenant profile
    path("tenant/", TenantProfileView.as_view(), name="tenant_profile"),
    path("tenant/invite-user/", TenantInviteUserView.as_view(), name="tenant_invite_user"),

    # CEP lookup
    path("cep/<str:cep>/", CepLookupView.as_view(), name="cep_lookup"),

    # Router-registered viewsets
    path("", include(router.urls)),
]
