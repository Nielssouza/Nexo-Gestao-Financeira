from django.urls import path

from investments.views import (
    InvestmentCreateView,
    InvestmentDetailView,
    InvestmentListView,
    InvestmentUpdateView,
)

app_name = "investments"

urlpatterns = [
    path("", InvestmentListView.as_view(), name="list"),
    path("novo/", InvestmentCreateView.as_view(), name="create"),
    path("<int:pk>/", InvestmentDetailView.as_view(), name="detail"),
    path("<int:pk>/editar/", InvestmentUpdateView.as_view(), name="update"),
]
