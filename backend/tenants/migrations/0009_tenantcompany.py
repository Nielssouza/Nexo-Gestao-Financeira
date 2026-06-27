from django.db import migrations, models
import django.db.models.deletion


def create_default_companies(apps, schema_editor):
    Tenant = apps.get_model("tenants", "Tenant")
    TenantCompany = apps.get_model("tenants", "TenantCompany")

    for tenant in Tenant.objects.all():
        TenantCompany.objects.get_or_create(
            tenant=tenant,
            sequence_number="1",
            defaults={
                "name": tenant.name,
                "document": tenant.document,
                "email": tenant.email,
                "phone": tenant.phone,
                "address": tenant.address,
                "address_number": tenant.address_number,
                "address_complement": tenant.address_complement,
                "district": tenant.district,
                "city": tenant.city,
                "state": tenant.state,
                "postal_code": tenant.postal_code,
                "is_default": True,
                "is_active": True,
            },
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0008_add_person_type_to_tenant"),
    ]

    operations = [
        migrations.CreateModel(
            name="TenantCompany",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=160, verbose_name="Nome")),
                ("document", models.CharField(blank=True, max_length=20, verbose_name="CNPJ/CPF")),
                ("sequence_number", models.CharField(max_length=20, verbose_name="Sequencia numerica")),
                ("email", models.EmailField(blank=True, max_length=254, verbose_name="E-mail")),
                ("phone", models.CharField(blank=True, max_length=20, verbose_name="Telefone")),
                ("address", models.CharField(blank=True, max_length=200, verbose_name="Logradouro")),
                ("address_number", models.CharField(blank=True, max_length=20, verbose_name="Numero")),
                ("address_complement", models.CharField(blank=True, max_length=100, verbose_name="Complemento")),
                ("district", models.CharField(blank=True, max_length=100, verbose_name="Bairro")),
                ("city", models.CharField(blank=True, max_length=100, verbose_name="Cidade")),
                ("state", models.CharField(blank=True, max_length=2, verbose_name="UF")),
                ("postal_code", models.CharField(blank=True, max_length=9, verbose_name="CEP")),
                ("is_default", models.BooleanField(default=False, verbose_name="Empresa padrao")),
                ("is_active", models.BooleanField(default=True, verbose_name="Ativa")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Criado em")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Atualizado em")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="companies", to="tenants.tenant")),
            ],
            options={
                "verbose_name": "Empresa do tenant",
                "verbose_name_plural": "Empresas do tenant",
                "ordering": ("sequence_number", "name", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="tenantcompany",
            constraint=models.UniqueConstraint(fields=("tenant", "sequence_number"), name="unique_company_sequence_per_tenant"),
        ),
        migrations.AddConstraint(
            model_name="tenantcompany",
            constraint=models.UniqueConstraint(condition=models.Q(("is_default", True)), fields=("tenant",), name="unique_default_company_per_tenant"),
        ),
        migrations.RunPython(create_default_companies, noop_reverse),
    ]
