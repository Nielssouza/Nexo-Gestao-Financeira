import json
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.views import View
from django.views.generic import UpdateView

from invoices.nfse_crypto import encrypt_password
from tenants.forms import NfseCredentialForm, TenantForm
from tenants.models import NfseCredential


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
        messages.success(self.request, "Informacoes da empresa atualizadas com sucesso.")
        return super().form_valid(form)


class NfseCredentialView(LoginRequiredMixin, View):
    template_name = "tenants/nfse_credential_form.html"

    def get(self, request):
        credential = getattr(request.tenant, "nfse_credential", None)
        form = NfseCredentialForm(instance=credential)
        return self._render(request, form, credential)

    def post(self, request):
        credential = getattr(request.tenant, "nfse_credential", None)
        form = NfseCredentialForm(request.POST, instance=credential)
        if form.is_valid():
            obj = form.save(commit=False)
            obj.tenant = request.tenant
            raw_password = form.cleaned_data.get("gov_br_password")
            if raw_password:
                obj.gov_br_password_enc = encrypt_password(raw_password)
            obj.save()
            messages.success(request, "Credenciais gov.br salvas com sucesso.")
            return redirect("tenants:nfse-credential")
        return self._render(request, form, credential)

    def _render(self, request, form, credential):
        from django.shortcuts import render
        return render(request, self.template_name, {"form": form, "credential": credential})


class CepLookupView(LoginRequiredMixin, View):
    def get(self, request, cep):
        digits = "".join(char for char in cep if char.isdigit())
        if len(digits) != 8:
            return JsonResponse({"error": "CEP invalido."}, status=400)

        try:
            with urlopen(f"https://viacep.com.br/ws/{digits}/json/", timeout=8) as response:
                data = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            return JsonResponse({"error": "Nao foi possivel consultar o CEP."}, status=502)

        if data.get("erro"):
            return JsonResponse({"error": "CEP nao encontrado."}, status=404)

        return JsonResponse(
            {
                "address": data.get("logradouro", ""),
                "district": data.get("bairro", ""),
                "city": data.get("localidade", ""),
                "state": data.get("uf", ""),
                "postal_code": data.get("cep", ""),
                "complement": data.get("complemento", ""),
            }
        )
