from datetime import date
from decimal import Decimal, InvalidOperation
import re

from django import forms

from accounts.models import Account
from categories.models import Category
from common.forms import style_form_fields
from common.tenancy import resolve_tenant
from transactions.models import Transaction


class TransactionForm(forms.ModelForm):
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
    date = forms.DateField(
        label="Data",
        widget=forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
    )

    class Meta:
        model = Transaction
        fields = (
            "transaction_type",
            "amount",
            "date",
            "is_cleared",
            "account",
            "destination_account",
            "category",
            "description",
            "recurrence_type",
            "installment_count",
            "recurrence_interval_unit",
        )
        labels = {
            "transaction_type": "Tipo",
            "amount": "Valor",
            "is_cleared": "Baixada (recebida/paga)",
            "account": "Conta",
            "destination_account": "Conta destino (transferencia)",
            "category": "Categoria",
            "description": "Descricao",
            "recurrence_type": "Recorrencia",
            "installment_count": "Quantidade de parcelas",
            "recurrence_interval_unit": "Unidade do intervalo",
        }
        widgets = {
            "description": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        user = kwargs.pop("user")
        tenant = resolve_tenant(tenant=kwargs.pop("tenant", None), user=user)
        super().__init__(*args, **kwargs)

        self.instance.user = user
        self.instance.tenant = tenant

        if "recurrence_type" in self.fields:
            self.fields["recurrence_type"].choices = [
                (Transaction.RecurrenceType.ONCE, "Unica"),
                (Transaction.RecurrenceType.FIXED, "Fixa"),
                (Transaction.RecurrenceType.INSTALLMENT, "Parcelado"),
            ]
            if not self.instance.pk and not self.is_bound:
                self.fields["recurrence_type"].initial = Transaction.RecurrenceType.ONCE

        if "recurrence_interval_unit" in self.fields:
            self.fields["recurrence_interval_unit"].choices = [
                (Transaction.IntervalUnit.DAY, "Dias"),
                (Transaction.IntervalUnit.MONTH, "Mes"),
                (Transaction.IntervalUnit.YEAR, "Ano"),
            ]
            self.fields["recurrence_interval_unit"].required = False
            if not self.instance.pk and not self.is_bound:
                self.fields["recurrence_interval_unit"].initial = Transaction.IntervalUnit.MONTH

        if self.instance and self.instance.pk and "amount" in self.fields:
            self.initial["amount"] = f"{self.instance.amount:.2f}"

        if self.instance and self.instance.pk and self.instance.date and "date" in self.fields:
            self.initial["date"] = self.instance.date.isoformat()

        if "is_cleared" in self.fields:
            self.fields["is_cleared"].required = False
            self.fields["is_cleared"].help_text = "Desmarcada = pendente."

        account_qs = Account.objects.filter(tenant=tenant, is_active=True).order_by("name")
        self.fields["account"].queryset = account_qs

        if "destination_account" in self.fields:
            self.fields["destination_account"].queryset = account_qs
            self.fields["destination_account"].required = False

        if "category" in self.fields:
            self.fields["category"].queryset = Category.objects.filter(tenant=tenant).order_by(
                "category_type", "name"
            )
            self.fields["category"].required = False

        if "installment_count" in self.fields:
            self.fields["installment_count"].required = False
            self.fields["installment_count"].widget.attrs.update(
                {"min": "2", "step": "1", "placeholder": "Ex.: 12"}
            )

        style_form_fields(self)

    def clean_amount(self):
        raw_value = (self.cleaned_data.get("amount") or "").strip()
        if not raw_value:
            raise forms.ValidationError("Informe um valor maior que zero.")

        normalized = raw_value.replace("R$", "").replace(" ", "")
        normalized = normalized.replace("\u00a0", "")
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

    def clean(self):
        cleaned_data = super().clean()
        transaction_type = cleaned_data.get("transaction_type")
        recurrence_type = cleaned_data.get("recurrence_type")

        if recurrence_type not in {
            Transaction.RecurrenceType.ONCE,
            Transaction.RecurrenceType.FIXED,
            Transaction.RecurrenceType.INSTALLMENT,
        }:
            self.add_error("recurrence_type", "Recorrencia invalida.")

        if transaction_type == Transaction.TransactionType.TRANSFER:
            cleaned_data["category"] = None
        else:
            cleaned_data["destination_account"] = None

        if recurrence_type != Transaction.RecurrenceType.INSTALLMENT:
            cleaned_data["installment_count"] = None

        cleaned_data["recurrence_interval"] = 1
        self.instance.recurrence_interval = 1

        interval_unit = (
            cleaned_data.get("recurrence_interval_unit") or Transaction.IntervalUnit.MONTH
        )
        if interval_unit not in {
            Transaction.IntervalUnit.DAY,
            Transaction.IntervalUnit.MONTH,
            Transaction.IntervalUnit.YEAR,
        }:
            self.add_error("recurrence_interval_unit", "Unidade de intervalo invalida.")
            interval_unit = Transaction.IntervalUnit.MONTH
        cleaned_data["recurrence_interval_unit"] = interval_unit

        if recurrence_type == Transaction.RecurrenceType.ONCE:
            cleaned_data["recurrence_interval"] = 1
            cleaned_data["recurrence_interval_unit"] = Transaction.IntervalUnit.MONTH

        return cleaned_data


class QuickTransactionForm(TransactionForm):
    class Meta(TransactionForm.Meta):
        fields = (
            "transaction_type",
            "amount",
            "date",
            "is_cleared",
            "account",
            "destination_account",
            "category",
            "recurrence_type",
            "installment_count",
            "recurrence_interval_unit",
            "description",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["transaction_type"].choices = [
            choice
            for choice in self.fields["transaction_type"].choices
            if choice[0]
            in {
                Transaction.TransactionType.INCOME,
                Transaction.TransactionType.EXPENSE,
                Transaction.TransactionType.TRANSFER,
            }
        ]
        self.fields["recurrence_type"].choices = [
            (Transaction.RecurrenceType.ONCE, "Unica"),
            (Transaction.RecurrenceType.FIXED, "Fixa"),
            (Transaction.RecurrenceType.INSTALLMENT, "Parcelado"),
        ]
        if not self.instance.pk and not self.is_bound:
            self.fields["recurrence_type"].initial = Transaction.RecurrenceType.ONCE

    def clean(self):
        cleaned_data = super().clean()
        recurrence_type = cleaned_data.get("recurrence_type")
        installment_count = cleaned_data.get("installment_count")

        if recurrence_type == Transaction.RecurrenceType.INSTALLMENT:
            if not installment_count or installment_count < 2:
                self.add_error(
                    "installment_count", "Informe a quantidade de parcelas (minimo 2)."
                )
        else:
            cleaned_data["installment_count"] = None

        return cleaned_data


class StatementFilterForm(forms.Form):
    ORDER_CHOICES = [
        ("recent", "Mais recentes"),
        ("oldest", "Mais antigas"),
        ("amount_desc", "Maior valor"),
        ("amount_asc", "Menor valor"),
        ("pending", "Pendentes primeiro"),
        ("cleared", "Baixadas primeiro"),
    ]

    month = forms.CharField(
        label="Mes",
        required=False,
    )
    account = forms.ModelChoiceField(
        label="Conta",
        required=False,
        queryset=Account.objects.none(),
        empty_label="Todas",
    )
    category = forms.ModelChoiceField(
        label="Categoria",
        required=False,
        queryset=Category.objects.none(),
        empty_label="Todas",
    )
    order_by = forms.ChoiceField(
        label="Classificacao",
        required=False,
        choices=ORDER_CHOICES,
    )

    def __init__(self, *args, **kwargs):
        user = kwargs.pop("user")
        tenant = resolve_tenant(tenant=kwargs.pop("tenant", None), user=user)
        super().__init__(*args, **kwargs)

        self.fields["account"].queryset = Account.objects.filter(
            tenant=tenant, is_active=True
        ).order_by("name")
        self.fields["category"].queryset = Category.objects.filter(tenant=tenant).order_by(
            "category_type", "name"
        )
        self.fields["order_by"].initial = self.ORDER_CHOICES[0][0]
        style_form_fields(self)

    def clean_month(self):
        value = self.cleaned_data.get("month")
        if not value:
            return None

        try:
            year, month = value.split("-")
            return date(int(year), int(month), 1)
        except (ValueError, TypeError):
            return None
