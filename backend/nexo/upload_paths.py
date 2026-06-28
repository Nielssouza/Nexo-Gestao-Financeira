"""
Upload paths centralizados para o bucket S3.

Todos os arquivos são organizados sob tenants/{slug}/{subdir}/{unique}.{ext}.

Uso:
    from nexo.upload_paths import TenantPath

    # Em um model com FK para Tenant:
    arquivo = models.FileField(upload_to=TenantPath("transacoes/comprovantes"))

    # No próprio model Tenant:
    logo = models.ImageField(upload_to=TenantPath("logo", self_is_tenant=True))
"""

import uuid


class TenantPath:
    """
    Callable upload_to serializável pelo sistema de migrations do Django.

    self_is_tenant=True  → o próprio instance é o Tenant (usa instance.slug)
    self_is_tenant=False → instance tem FK tenant (usa instance.tenant.slug)
    """

    def __init__(self, subdir: str, self_is_tenant: bool = False):
        self.subdir = subdir
        self.self_is_tenant = self_is_tenant

    def __call__(self, instance, filename):
        slug = instance.slug if self.self_is_tenant else instance.tenant.slug
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        unique = uuid.uuid4().hex[:8]
        return f"tenants/{slug}/{self.subdir}/{unique}.{ext}"

    def deconstruct(self):
        kwargs = {}
        if self.self_is_tenant:
            kwargs["self_is_tenant"] = True
        return ("nexo.upload_paths.TenantPath", [self.subdir], kwargs)
