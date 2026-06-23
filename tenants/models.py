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
    address = models.CharField("Endereço", max_length=200, blank=True)
    city = models.CharField("Cidade e UF", max_length=100, blank=True)
    logo = models.ImageField("Logo da empresa", upload_to="tenant_logos/", blank=True, null=True)
    
    is_active = models.BooleanField("Ativo", default=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("name", "id")
        verbose_name = "Cliente"
        verbose_name_plural = "Clientes"

    def __str__(self):
        return self.name


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
