from decimal import Decimal

from django import forms
from django.utils import timezone

from accounts.models import Account
from common.forms import style_form_fields


class CreditLimitForm(forms.Form):
    account = forms.ModelChoiceField(
        queryset=Account.objects.none(),
        label="Cartão",
        empty_label="Selecione o cartão",
    )
    month = forms.CharField(
        label="Mês",
        widget=forms.DateInput(attrs={"type": "month"}),
    )
    amount = forms.DecimalField(
        label="Limite",
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        widget=forms.TextInput(attrs={"inputmode": "decimal", "placeholder": "0.00"}),
    )

    def __init__(self, *args, tenant=None, **kwargs):
        super().__init__(*args, **kwargs)
        if tenant:
            self.fields["account"].queryset = Account.objects.filter(
                tenant=tenant,
                account_type=Account.AccountType.CARD,
                is_active=True,
            )
        today = timezone.localdate()
        self.fields["month"].initial = today.strftime("%Y-%m")
        style_form_fields(self)

    def clean_month(self):
        value = self.cleaned_data.get("month", "")
        try:
            year, month = value.split("-")
            year, month = int(year), int(month)
            if not (1 <= month <= 12):
                raise ValueError
            return year, month
        except (ValueError, AttributeError):
            raise forms.ValidationError("Informe um mês válido no formato AAAA-MM.")


class AccountForm(forms.ModelForm):
    class Meta:
        model = Account
        fields = (
            "name",
            "account_type",
            "initial_balance",
            "include_in_balance",
            "is_active",
        )
        labels = {
            "name": "Nome da conta",
            "account_type": "Tipo",
            "initial_balance": "Saldo inicial",
            "include_in_balance": "Considerar no saldo",
            "is_active": "Conta ativa",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_form_fields(self)
