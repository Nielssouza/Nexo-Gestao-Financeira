from django.urls import path

from tenants.views import CepLookupView, NfseCredentialView, TenantUpdateView

app_name = "tenants"

urlpatterns = [
    path("", TenantUpdateView.as_view(), name="update"),
    path("nfse/credenciais/", NfseCredentialView.as_view(), name="nfse-credential"),
    path("cep/<str:cep>/", CepLookupView.as_view(), name="cep-lookup"),
]
