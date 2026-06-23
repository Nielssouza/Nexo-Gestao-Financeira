from django import forms
from django.utils.timezone import localdate

from invoices.models import Client, Invoice


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
    launch_financial = forms.TypedChoiceField(
        label="Lancar no financeiro",
        choices=(
            ("1", "Sim, lancar automaticamente"),
            ("0", "Nao lancar agora"),
        ),
        coerce=lambda value: str(value) == "1",
        empty_value=False,
        widget=forms.Select(attrs={"class": "app-input"}),
    )
    gross_value = forms.DecimalField(
        label="Valor bruto (R$)",
        max_digits=12,
        decimal_places=2,
        localize=True,
        widget=forms.TextInput(attrs={"class": "app-input"}),
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
            "deductions",
            "iss_rate",
            "iss_withheld",
            "pis_rate",
            "cofins_rate",
            "csll_rate",
            "ir_rate",
            "inss_rate",
            "launch_financial",
            "expected_account",
            "notes",
            "recurrence_type",
            "recurrence_interval",
            "recurrence_interval_unit",
            "installment_count",
        ]
        widgets = {
            "issue_date": forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d"),
            "due_date": forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d"),
            "service_description": forms.Textarea(attrs={"rows": 4}),
            "service_code": forms.TextInput(
                attrs={
                    "placeholder": "Selecione ou digite o codigo...",
                    "autocomplete": "off",
                }
            ),
            "notes": forms.Textarea(attrs={"rows": 3}),
            "deductions": forms.TextInput(attrs={"placeholder": "0,00", "inputmode": "decimal"}),
            "iss_rate": forms.TextInput(attrs={"placeholder": "0,00", "inputmode": "decimal"}),
            "pis_rate": forms.TextInput(attrs={"placeholder": "0,65", "inputmode": "decimal"}),
            "cofins_rate": forms.TextInput(attrs={"placeholder": "3,00", "inputmode": "decimal"}),
            "csll_rate": forms.TextInput(attrs={"placeholder": "1,00", "inputmode": "decimal"}),
            "ir_rate": forms.TextInput(attrs={"placeholder": "1,50", "inputmode": "decimal"}),
            "inss_rate": forms.TextInput(attrs={"placeholder": "0,00", "inputmode": "decimal"}),
            "recurrence_type": forms.Select(
                attrs={"class": "app-input", "onchange": "toggleRecurrenceFields(this.value)"}
            ),
            "recurrence_interval": forms.NumberInput(attrs={"class": "app-input"}),
            "recurrence_interval_unit": forms.Select(attrs={"class": "app-input"}),
            "installment_count": forms.NumberInput(attrs={"class": "app-input"}),
        }

    def __init__(self, *args, **kwargs):
        tenant = kwargs.pop("tenant", None)
        super().__init__(*args, **kwargs)
        if not self.instance.pk:
            self.fields["issue_date"].initial = localdate()
            self.fields["launch_financial"].initial = "1"
        else:
            self.fields["launch_financial"].initial = (
                "1" if self.instance.transaction_id else "0"
            )
        if tenant:
            from accounts.models import Account

            self.fields["expected_account"].queryset = Account.objects.filter(
                tenant=tenant
            )
        for field in self.fields.values():
            if isinstance(field.widget, forms.CheckboxInput):
                field.widget.attrs["class"] = "app-checkbox"
            else:
                field.widget.attrs.setdefault("class", "app-input")

    def clean(self):
        cleaned_data = super().clean()
        if cleaned_data.get("launch_financial") and not cleaned_data.get(
            "expected_account"
        ):
            self.add_error(
                "expected_account",
                "Selecione a conta para lancar a fatura automaticamente no financeiro.",
            )
        return cleaned_data


class InvoicePayForm(forms.Form):
    launch_financial = forms.TypedChoiceField(
        label="Lancar no financeiro",
        choices=(
            ("1", "Sim, registrar recebimento"),
            ("0", "Nao lancar agora"),
        ),
        coerce=lambda value: str(value) == "1",
        empty_value=False,
        widget=forms.Select(attrs={"class": "app-input"}),
    )
    account = forms.ModelChoiceField(
        queryset=None,
        label="Conta de credito",
        empty_label="Selecione uma conta",
        required=False,
        widget=forms.Select(attrs={"class": "app-input"}),
    )
    paid_at = forms.DateField(
        label="Data de recebimento",
        widget=forms.DateInput(
            attrs={"type": "date", "class": "app-input"}, format="%Y-%m-%d"
        ),
    )

    def __init__(self, *args, tenant=None, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import Account

        qs = Account.objects.filter(is_active=True)
        if tenant:
            qs = qs.filter(tenant=tenant)
        self.fields["account"].queryset = qs
        self.fields["launch_financial"].initial = "1"
        self.fields["paid_at"].initial = localdate()

    def clean(self):
        cleaned_data = super().clean()
        if cleaned_data.get("launch_financial") and not cleaned_data.get("account"):
            self.add_error(
                "account",
                "Selecione a conta para registrar o recebimento no financeiro.",
            )
        return cleaned_data
