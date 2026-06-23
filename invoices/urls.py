from django.urls import path

from invoices.views import (
    ClientCreateView,
    ClientListView,
    ClientPrefillView,
    ClientSearchView,
    ClientCheckView,
    ClientUpdateView,
    CnpjLookupView,
    InvoiceCancelView,
    InvoiceCreateView,
    InvoiceDeleteView,
    InvoiceDetailView,
    InvoiceListView,
    InvoiceNfseEmitView,
    InvoiceNfseGuideView,
    InvoiceNfseStatusView,
    InvoicePayView,
    InvoiceUpdateView,
    InvoicePrintView,
)

app_name = "invoices"

urlpatterns = [
    path("", InvoiceListView.as_view(), name="list"),
    path("nova/", InvoiceCreateView.as_view(), name="create"),
    path("<int:pk>/", InvoiceDetailView.as_view(), name="detail"),
    path("<int:pk>/imprimir/", InvoicePrintView.as_view(), name="print"),
    path("<int:pk>/nfse/", InvoiceNfseGuideView.as_view(), name="nfse-guide"),
    path("<int:pk>/nfse/emitir/", InvoiceNfseEmitView.as_view(), name="nfse-emit"),
    path("<int:pk>/nfse/status/", InvoiceNfseStatusView.as_view(), name="nfse-status"),
    path("<int:pk>/editar/", InvoiceUpdateView.as_view(), name="update"),
    path("<int:pk>/excluir/", InvoiceDeleteView.as_view(), name="delete"),
    path("<int:pk>/pagar/", InvoicePayView.as_view(), name="pay"),
    path("<int:pk>/cancelar/", InvoiceCancelView.as_view(), name="cancel"),
    path("clientes/", ClientListView.as_view(), name="client-list"),
    path("clientes/buscar/", ClientSearchView.as_view(), name="client-search"),
    path("clientes/verificar/", ClientCheckView.as_view(), name="client-check"),
    path("clientes/<int:pk>/pre-preencher/", ClientPrefillView.as_view(), name="client-prefill"),
    path("clientes/novo/", ClientCreateView.as_view(), name="client-create"),
    path("clientes/<int:pk>/editar/", ClientUpdateView.as_view(), name="client-edit"),
    path("cnpj/<str:cnpj>/", CnpjLookupView.as_view(), name="cnpj-lookup"),
]
