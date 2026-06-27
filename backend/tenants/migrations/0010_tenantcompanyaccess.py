from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0009_tenantcompany"),
    ]

    operations = [
        migrations.CreateModel(
            name="TenantCompanyAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Criado em")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="membership_accesses", to="tenants.tenantcompany")),
                ("membership", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="company_accesses", to="tenants.tenantmembership")),
            ],
            options={
                "verbose_name": "Acesso a empresa do tenant",
                "verbose_name_plural": "Acessos a empresas do tenant",
                "ordering": ("company__sequence_number", "company__name", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="tenantcompanyaccess",
            constraint=models.UniqueConstraint(fields=("membership", "company"), name="unique_tenant_company_access"),
        ),
    ]
