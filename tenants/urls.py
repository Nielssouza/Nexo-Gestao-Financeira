from django.urls import path

from tenants.views import TenantUpdateView

app_name = "tenants"

urlpatterns = [
    path("", TenantUpdateView.as_view(), name="update"),
]
