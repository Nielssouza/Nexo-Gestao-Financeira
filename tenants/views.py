from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.views.generic import UpdateView

from tenants.forms import TenantForm


class TenantUpdateView(LoginRequiredMixin, UpdateView):
    form_class = TenantForm
    template_name = "tenants/tenant_form.html"
    success_url = reverse_lazy("tenants:update")

    def get_object(self, queryset=None):
        return self.request.tenant

    def form_valid(self, form):
        clear = self.request.POST.get("logo-clear")
        if clear:
            form.instance.logo = None
        messages.success(self.request, "Informações da empresa atualizadas com sucesso.")
        return super().form_valid(form)
