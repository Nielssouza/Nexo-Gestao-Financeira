from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from tenants.models import Tenant
from tenants.services import ensure_default_tenant_company


@receiver(post_save, sender=Tenant)
def ensure_default_company_for_tenant(sender, instance, created, raw, **kwargs):
    if raw or not created:
        return

    tenant_pk = instance.pk

    def _run():
        try:
            tenant = Tenant.objects.get(pk=tenant_pk)
            ensure_default_tenant_company(tenant)
        except Tenant.DoesNotExist:
            pass

    if getattr(settings, "TESTING", False):
        _run()
    else:
        transaction.on_commit(_run)
