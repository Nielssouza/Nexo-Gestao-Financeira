from django import forms
from django.core.exceptions import ValidationError

from tenants.models import NfseCredential, Tenant

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


class TenantForm(forms.ModelForm):
    class Meta:
        model = Tenant
        fields = [
            "name",
            "document",
            "email",
            "phone",
            "address",
            "address_number",
            "address_complement",
            "district",
            "city",
            "state",
            "postal_code",
            "logo",
        ]
        widgets = {
            "name": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "Nome fantasia ou Razao social"}
            ),
            "document": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "Ex: 00.000.000/0001-00"}
            ),
            "email": forms.EmailInput(
                attrs={"class": "app-input", "placeholder": "contato@empresa.com"}
            ),
            "phone": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "(00) 00000-0000"}
            ),
            "address": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "Rua, avenida, quadra..."}
            ),
            "address_number": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "Numero"}
            ),
            "address_complement": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "Casa, sala, bloco, lote..."}
            ),
            "district": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "Bairro"}
            ),
            "city": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "Cidade"}
            ),
            "state": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "UF", "maxlength": "2"}
            ),
            "postal_code": forms.TextInput(
                attrs={"class": "app-input", "placeholder": "00000-000", "maxlength": "9"}
            ),
            "logo": forms.FileInput(
                attrs={
                    "class": "hidden",
                    "accept": "image/png,image/jpeg,image/gif,image/webp",
                    "id": "id_logo",
                }
            ),
        }

    def clean_state(self):
        state = (self.cleaned_data.get("state") or "").strip().upper()
        return state

    def clean_postal_code(self):
        postal_code = (self.cleaned_data.get("postal_code") or "").strip()
        return postal_code

    def clean_logo(self):
        logo = self.cleaned_data.get("logo")
        if not logo or not hasattr(logo, "name"):
            return logo
        ext = logo.name.rsplit(".", 1)[-1].lower() if "." in logo.name else ""
        content_type = getattr(logo, "content_type", "")
        if ext not in ALLOWED_IMAGE_EXTENSIONS or "svg" in content_type:
            raise ValidationError("Formato nao permitido. Use PNG, JPG, GIF ou WebP.")
        if logo.size > MAX_LOGO_SIZE:
            raise ValidationError("A logo deve ter no maximo 2 MB.")
        return logo


class NfseCredentialForm(forms.ModelForm):
    gov_br_password = forms.CharField(
        label="Senha gov.br",
        widget=forms.PasswordInput(attrs={"class": "app-input", "placeholder": "Sua senha do gov.br"}),
        required=True,
    )

    class Meta:
        model = NfseCredential
        fields = ["gov_br_cpf"]
        widgets = {
            "gov_br_cpf": forms.TextInput(attrs={"class": "app-input", "placeholder": "000.000.000-00", "maxlength": "14"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance and self.instance.pk:
            self.fields["gov_br_password"].help_text = "Deixe em branco para manter a senha atual."
            self.fields["gov_br_password"].required = False

    def clean_gov_br_cpf(self):
        import re
        cpf = re.sub(r"\D", "", self.cleaned_data.get("gov_br_cpf", ""))
        if len(cpf) != 11:
            raise ValidationError("CPF invalido.")
        return cpf
