import re
from decimal import Decimal, InvalidOperation

from django import forms

from common.forms import style_form_fields
from investments.models import Investment, InvestmentEntry


class InvestmentForm(forms.ModelForm):
    class Meta:
        model = Investment
        fields = ("name", "investment_type", "broker", "is_active")
        labels = {
            "name": "Nome",
            "investment_type": "Tipo",
            "broker": "Corretora / Banco",
            "is_active": "Ativo",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["is_active"].required = False
        style_form_fields(self)


class InvestmentEntryForm(forms.ModelForm):
    amount = forms.CharField(
        label="Valor",
        widget=forms.TextInput(
            attrs={
                "inputmode": "numeric",
                "autocomplete": "off",
                "placeholder": "R$ 0,00",
            }
        ),
    )

    class Meta:
        model = InvestmentEntry
        fields = ("entry_type", "amount", "date", "description")
        labels = {
            "entry_type": "Tipo",
            "date": "Data",
            "description": "Descricao",
        }
        widgets = {
            "date": forms.DateInput(attrs={"type": "date"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_form_fields(self)

    def clean_amount(self):
        raw = (self.cleaned_data.get("amount") or "").strip()
        if not raw:
            raise forms.ValidationError("Informe um valor maior que zero.")

        normalized = raw.replace("R$", "").replace(" ", "").replace(" ", "")
        normalized = re.sub(r"[^\d,.-]", "", normalized)
        if "," in normalized:
            normalized = normalized.replace(".", "").replace(",", ".")

        try:
            value = Decimal(normalized)
        except (InvalidOperation, ValueError):
            raise forms.ValidationError("Informe um valor valido.")

        if value <= 0:
            raise forms.ValidationError("Informe um valor maior que zero.")

        return value.quantize(Decimal("0.01"))
