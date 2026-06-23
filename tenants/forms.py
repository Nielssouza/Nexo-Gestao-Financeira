from django import forms
from django.core.exceptions import ValidationError

from tenants.models import Tenant

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


class TenantForm(forms.ModelForm):
    class Meta:
        model = Tenant
        fields = ["name", "document", "email", "phone", "address", "city", "logo"]
        widgets = {
            "name": forms.TextInput(attrs={"class": "app-input", "placeholder": "Nome fantasia ou Razão social"}),
            "document": forms.TextInput(attrs={"class": "app-input", "placeholder": "Ex: 00.000.000/0001-00"}),
            "email": forms.EmailInput(attrs={"class": "app-input", "placeholder": "contato@empresa.com"}),
            "phone": forms.TextInput(attrs={"class": "app-input", "placeholder": "(00) 00000-0000"}),
            "address": forms.TextInput(attrs={"class": "app-input", "placeholder": "Rua, Número, Bairro"}),
            "city": forms.TextInput(attrs={"class": "app-input", "placeholder": "Cidade - UF"}),
            "logo": forms.FileInput(attrs={"class": "hidden", "accept": "image/png,image/jpeg,image/gif,image/webp", "id": "id_logo"}),
        }

    def clean_logo(self):
        logo = self.cleaned_data.get("logo")
        if not logo or not hasattr(logo, "name"):
            return logo
        ext = logo.name.rsplit(".", 1)[-1].lower() if "." in logo.name else ""
        content_type = getattr(logo, "content_type", "")
        if ext not in ALLOWED_IMAGE_EXTENSIONS or "svg" in content_type:
            raise ValidationError("Formato não permitido. Use PNG, JPG, GIF ou WebP.")
        if logo.size > MAX_LOGO_SIZE:
            raise ValidationError("A logo deve ter no máximo 2 MB.")
        return logo
