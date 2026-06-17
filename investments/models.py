from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from common.tenancy import assign_tenant


class Investment(models.Model):
    class InvestmentType(models.TextChoices):
        STOCKS = "stocks", "Ações"
        FII = "fii", "FII"
        FIXED_INCOME = "fixed_income", "Renda Fixa"
        CRYPTO = "crypto", "Cripto"
        SAVINGS = "savings", "Poupança"
        EMERGENCY = "emergency", "Reserva de Emergência"
        OTHER = "other", "Outro"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="investments",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="investments",
        null=True,
        blank=True,
    )
    name = models.CharField("Nome", max_length=120)
    investment_type = models.CharField(
        "Tipo",
        max_length=20,
        choices=InvestmentType.choices,
        default=InvestmentType.OTHER,
    )
    broker = models.CharField("Corretora / Banco", max_length=120, blank=True)
    is_active = models.BooleanField("Ativo", default=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("-is_active", "name")
        verbose_name = "Investimento"
        verbose_name_plural = "Investimentos"

    def __str__(self):
        return self.name

    @property
    def total_invested(self) -> Decimal:
        return self.entries.filter(
            entry_type=InvestmentEntry.EntryType.DEPOSIT
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

    @property
    def total_withdrawn(self) -> Decimal:
        return self.entries.filter(
            entry_type=InvestmentEntry.EntryType.WITHDRAWAL
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

    @property
    def total_earnings(self) -> Decimal:
        return self.entries.filter(
            entry_type__in=[
                InvestmentEntry.EntryType.DIVIDEND,
                InvestmentEntry.EntryType.YIELD,
            ]
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]

    @property
    def net_invested(self) -> Decimal:
        return self.total_invested - self.total_withdrawn

    def save(self, *args, **kwargs):
        assign_tenant(self)
        return super().save(*args, **kwargs)


class InvestmentEntry(models.Model):
    class EntryType(models.TextChoices):
        DEPOSIT = "deposit", "Aporte"
        WITHDRAWAL = "withdrawal", "Resgate"
        DIVIDEND = "dividend", "Dividendo"
        YIELD = "yield", "Rendimento"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="investment_entries",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="investment_entries",
        null=True,
        blank=True,
    )
    investment = models.ForeignKey(
        Investment,
        on_delete=models.CASCADE,
        related_name="entries",
        verbose_name="Investimento",
    )
    entry_type = models.CharField(
        "Tipo",
        max_length=20,
        choices=EntryType.choices,
        default=EntryType.DEPOSIT,
    )
    amount = models.DecimalField("Valor", max_digits=12, decimal_places=2)
    date = models.DateField("Data", default=timezone.localdate)
    description = models.CharField("Descricao", max_length=255, blank=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)

    class Meta:
        ordering = ("-date", "-created_at")
        verbose_name = "Lancamento de investimento"
        verbose_name_plural = "Lancamentos de investimento"
        indexes = [
            models.Index(fields=("tenant", "date")),
            models.Index(fields=("investment", "date")),
        ]

    def __str__(self):
        return f"{self.investment.name} - {self.get_entry_type_display()} R$ {self.amount}"

    def clean(self):
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({"amount": "Informe um valor maior que zero."})
        if self.investment_id and self.tenant_id and self.investment.tenant_id != self.tenant_id:
            raise ValidationError({"investment": "Investimento invalido para este cliente."})

    def save(self, *args, **kwargs):
        assign_tenant(self)
        self.full_clean()
        return super().save(*args, **kwargs)
