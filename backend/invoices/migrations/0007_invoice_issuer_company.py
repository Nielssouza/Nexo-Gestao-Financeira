from django.db import migrations, models
import django.db.models.deletion


def backfill_issuer_company(apps, schema_editor):
    Invoice = apps.get_model("invoices", "Invoice")
    TenantCompany = apps.get_model("tenants", "TenantCompany")

    companies_by_tenant = {
        company.tenant_id: company.pk
        for company in TenantCompany.objects.filter(is_default=True, is_active=True)
    }

    for invoice in Invoice.objects.filter(issuer_company__isnull=True).only("pk", "tenant_id"):
        company_id = companies_by_tenant.get(invoice.tenant_id)
        if company_id:
            Invoice.objects.filter(pk=invoice.pk).update(issuer_company_id=company_id)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0009_tenantcompany"),
        ("invoices", "0006_invoice_nfse_error_invoice_nfse_number_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="issuer_company",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invoices",
                to="tenants.tenantcompany",
                verbose_name="Empresa emissora",
            ),
        ),
        migrations.RunPython(backfill_issuer_company, noop_reverse),
    ]
