from django.conf import settings
from django.db import models
from django.db.models import Q


class Tenant(models.Model):
    name = models.CharField("Nome", max_length=120)
    slug = models.SlugField("Slug", max_length=140, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_tenants",
    )
    document = models.CharField("CNPJ/CPF", max_length=20, blank=True)
    email = models.EmailField("E-mail comercial", blank=True)
    phone = models.CharField("Telefone", max_length=20, blank=True)
    address = models.CharField("Logradouro", max_length=200, blank=True)
    address_number = models.CharField("Numero", max_length=20, blank=True)
    address_complement = models.CharField("Complemento", max_length=100, blank=True)
    district = models.CharField("Bairro", max_length=100, blank=True)
    city = models.CharField("Cidade", max_length=100, blank=True)
    state = models.CharField("UF", max_length=2, blank=True)
    postal_code = models.CharField("CEP", max_length=9, blank=True)
    logo = models.ImageField(
        "Logo da empresa",
        upload_to="tenant_logos/",
        blank=True,
        null=True,
    )

    is_active = models.BooleanField("Ativo", default=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("name", "id")
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"

    def __str__(self):
        return self.name

    @property
    def formatted_address_line(self):
        parts = [self.address]
        if self.address_number:
            parts.append(self.address_number)
        if self.address_complement:
            parts.append(self.address_complement)
        if self.district:
            parts.append(self.district)
        return ", ".join(part for part in parts if part)

    @property
    def formatted_city_state(self):
        if self.city and self.state:
            return f"{self.city} - {self.state}"
        return self.city or self.state

    @property
    def full_address(self):
        parts = [self.formatted_address_line, self.formatted_city_state]
        if self.postal_code:
            parts.append(f"CEP {self.postal_code}")
        return " | ".join(part for part in parts if part)


class NfseCredential(models.Model):
    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name="nfse_credential",
    )
    gov_br_cpf = models.CharField("CPF gov.br", max_length=14)
    gov_br_password_enc = models.TextField("Senha criptografada")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Credencial NFS-e"
        verbose_name_plural = "Credenciais NFS-e"

    def __str__(self):
        return f"NFS-e · {self.tenant}"


class TenantMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tenant_memberships",
    )
    role = models.CharField(
        "Perfil",
        max_length=20,
        choices=Role.choices,
        default=Role.OWNER,
    )
    is_default = models.BooleanField("Tenant padrao", default=False)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("-is_default", "tenant__name", "id")
        verbose_name = "Membro do cliente"
        verbose_name_plural = "Membros do cliente"
        constraints = [
            models.UniqueConstraint(
                fields=("tenant", "user"),
                name="unique_tenant_membership",
            ),
            models.UniqueConstraint(
                fields=("user",),
                condition=Q(is_default=True),
                name="unique_default_tenant_membership_per_user",
            ),
        ]

    def __str__(self):
        return f"{self.user} @ {self.tenant}"
