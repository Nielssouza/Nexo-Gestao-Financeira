from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import models
from django.db.models import Max

from transactions.models import Transaction


class Client(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoice_clients",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="invoice_clients",
        null=True,
        blank=True,
    )
    name = models.CharField("Nome", max_length=200)
    document = models.CharField("CPF / CNPJ", max_length=20, blank=True)
    email = models.EmailField("E-mail", blank=True)
    phone = models.CharField("Telefone", max_length=20, blank=True)
    address = models.CharField("Endereço", max_length=300, blank=True)
    city = models.CharField("Cidade / UF", max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"

    def __str__(self):
        return self.name


class Invoice(models.Model):
    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"
    CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (ISSUED, "Emitida"),
        (PAID, "Paga"),
        (CANCELLED, "Cancelada"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="invoices",
        null=True,
        blank=True,
    )
    number = models.PositiveIntegerField("Número")
    status = models.CharField(
        "Status", max_length=20, choices=STATUS_CHOICES, default=DRAFT
    )

    issue_date = models.DateField("Data de emissão")
    due_date = models.DateField("Vencimento", null=True, blank=True)

    # Tomador
    client_name = models.CharField("Nome do tomador", max_length=200)
    client_document = models.CharField("CPF / CNPJ", max_length=20, blank=True)
    client_email = models.EmailField("E-mail do tomador", blank=True)
    client_phone = models.CharField("Telefone", max_length=20, blank=True)
    client_address = models.CharField("Endereço", max_length=300, blank=True)
    client_city = models.CharField("Cidade / UF", max_length=100, blank=True)

    # Serviço
    service_code = models.CharField("Código do serviço (LC 116)", max_length=20, blank=True)
    service_description = models.TextField("Discriminação dos serviços")

    # Valores
    gross_value = models.DecimalField(
        "Valor bruto (R$)", max_digits=12, decimal_places=2
    )
    deductions = models.DecimalField(
        "Deduções (R$)", max_digits=12, decimal_places=2, default=Decimal("0.00")
    )

    # Alíquotas (%)
    iss_rate = models.DecimalField(
        "ISS (%)", max_digits=5, decimal_places=2, default=Decimal("0.00")
    )
    iss_withheld = models.BooleanField("ISS retido na fonte", default=False)
    pis_rate = models.DecimalField(
        "PIS (%)", max_digits=5, decimal_places=2, default=Decimal("0.00")
    )
    cofins_rate = models.DecimalField(
        "COFINS (%)", max_digits=5, decimal_places=2, default=Decimal("0.00")
    )
    csll_rate = models.DecimalField(
        "CSLL (%)", max_digits=5, decimal_places=2, default=Decimal("0.00")
    )
    ir_rate = models.DecimalField(
        "IR (%)", max_digits=5, decimal_places=2, default=Decimal("0.00")
    )
    inss_rate = models.DecimalField(
        "INSS (%)", max_digits=5, decimal_places=2, default=Decimal("0.00")
    )

    notes = models.TextField("Observações", blank=True)

    recurrence_type = models.CharField(
        "Recorrência",
        max_length=20,
        choices=Transaction.RecurrenceType.choices,
        default=Transaction.RecurrenceType.ONCE,
    )
    recurrence_interval = models.PositiveSmallIntegerField(
        "Intervalo de recorrência",
        default=1,
        help_text="Número do intervalo para gerar as próximas recorrências.",
    )
    recurrence_interval_unit = models.CharField(
        "Unidade do intervalo",
        max_length=10,
        choices=Transaction.IntervalUnit.choices,
        default=Transaction.IntervalUnit.MONTH,
    )
    installment_count = models.PositiveSmallIntegerField(
        "Quantidade de parcelas",
        null=True,
        blank=True,
        help_text="Informe apenas quando a recorrência for Parcelado.",
    )

    # NFS-e
    NFSE_PENDING = "nfse_pending"
    NFSE_PROCESSING = "nfse_processing"
    NFSE_ISSUED = "nfse_issued"
    NFSE_FAILED = "nfse_failed"
    NFSE_STATUS_CHOICES = [
        (NFSE_PENDING, "Aguardando emissão"),
        (NFSE_PROCESSING, "Emitindo..."),
        (NFSE_ISSUED, "NFS-e emitida"),
        (NFSE_FAILED, "Falha na emissão"),
    ]
    nfse_status = models.CharField(
        "Status NFS-e", max_length=20, choices=NFSE_STATUS_CHOICES, null=True, blank=True
    )
    nfse_number = models.CharField("Número NFS-e", max_length=50, blank=True)
    nfse_error = models.TextField("Erro NFS-e", blank=True)
    nfse_requested_at = models.DateTimeField("NFS-e solicitada em", null=True, blank=True)

    paid_at = models.DateField("Data de pagamento", null=True, blank=True)
    transaction = models.OneToOneField(
        "transactions.Transaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice",
    )
    expected_account = models.ForeignKey(
        "accounts.Account",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name="Conta prevista",
        help_text="Conta onde a receita deverá ser lançada ao confirmar o pagamento.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-number"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "number"],
                name="unique_invoice_number_per_tenant",
            )
        ]
        verbose_name = "Fatura"
        verbose_name_plural = "Faturas"

    def __str__(self):
        return f"Fatura {self.number_display} — {self.client_name}"

    @property
    def number_display(self):
        return f"{self.number:04d}/{self.issue_date.year}"

    @property
    def calculation_base(self):
        base = self.gross_value - self.deductions
        return max(base, Decimal("0.00"))

    def _tax(self, rate):
        return (self.calculation_base * rate / Decimal("100")).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    @property
    def iss_value(self):
        return self._tax(self.iss_rate)

    @property
    def pis_value(self):
        return self._tax(self.pis_rate)

    @property
    def cofins_value(self):
        return self._tax(self.cofins_rate)

    @property
    def csll_value(self):
        return self._tax(self.csll_rate)

    @property
    def ir_value(self):
        return self._tax(self.ir_rate)

    @property
    def inss_value(self):
        return self._tax(self.inss_rate)

    @property
    def total_withheld(self):
        total = (
            self.pis_value
            + self.cofins_value
            + self.csll_value
            + self.ir_value
            + self.inss_value
        )
        if self.iss_withheld:
            total += self.iss_value
        return total

    @property
    def net_value(self):
        return self.gross_value - self.total_withheld

    @classmethod
    def next_number(cls, tenant):
        result = cls.objects.filter(tenant=tenant).aggregate(Max("number"))
        return (result["number__max"] or 0) + 1
