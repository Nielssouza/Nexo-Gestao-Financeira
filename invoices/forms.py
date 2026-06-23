from django import forms
from django.utils.timezone import localdate

from invoices.models import Client, Invoice
from invoices.service_codes import SERVICE_CODES


class ClientForm(forms.ModelForm):
    class Meta:
        model = Client
        fields = ["name", "document", "email", "phone", "address", "city"]
        widgets = {
            "name": forms.TextInput(attrs={"class": "app-input"}),
            "document": forms.TextInput(attrs={"class": "app-input"}),
            "email": forms.EmailInput(attrs={"class": "app-input"}),
            "phone": forms.TextInput(attrs={"class": "app-input"}),
            "address": forms.TextInput(attrs={"class": "app-input"}),
            "city": forms.TextInput(attrs={"class": "app-input"}),
        }


class InvoiceForm(forms.ModelForm):
    gross_value = forms.DecimalField(
        label="Valor bruto (R$)",
        max_digits=12, 
        decimal_places=2, 
        localize=True,
        widget=forms.TextInput(attrs={"class": "app-input"})
    )

    class Meta:
        model = Invoice
        fields = [
            "issue_date",
            "due_date",
            "client_name",
            "client_document",
            "client_email",
            "client_phone",
            "client_address",
            "client_city",
            "service_code",
            "service_description",
            "gross_value",
            "expected_account",
            "notes",
        ]
        widgets = {
            "issue_date": forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d"),
            "due_date": forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d"),
            "service_description": forms.Textarea(attrs={"rows": 4}),
            "service_code": forms.TextInput(attrs={
                "placeholder": "Selecione ou digite o código...",
                "autocomplete": "off",
            }),
            "notes": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        tenant = kwargs.pop("tenant", None)
        super().__init__(*args, **kwargs)
        if not self.instance.pk:
            self.fields["issue_date"].initial = localdate()
        if tenant:
            from accounts.models import Account
            self.fields["expected_account"].queryset = Account.objects.filter(tenant=tenant)
        for field in self.fields.values():
            if isinstance(field.widget, forms.CheckboxInput):
                field.widget.attrs["class"] = "app-checkbox"
            else:
                field.widget.attrs.setdefault("class", "app-input")


class InvoicePayForm(forms.Form):
    account = forms.ModelChoiceField(
        queryset=None,
        label="Conta de crédito",
        empty_label="Selecione uma conta",
        widget=forms.Select(attrs={"class": "app-input"}),
    )
    paid_at = forms.DateField(
        label="Data de recebimento",
        widget=forms.DateInput(attrs={"type": "date", "class": "app-input"}, format="%Y-%m-%d"),
    )

    def __init__(self, *args, tenant=None, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import Account

        qs = Account.objects.filter(is_active=True)
        if tenant:
            qs = qs.filter(tenant=tenant)
        self.fields["account"].queryset = qs
        self.fields["paid_at"].initial = localdate()
