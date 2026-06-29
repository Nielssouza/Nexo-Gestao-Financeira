import pytest


@pytest.mark.django_db
def test_folder_creation(baker):
    """Pasta deve ser criada com nome correto."""
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    folder = baker.make("drive.Folder", tenant=tenant, name="Documentos Fiscais")

    assert folder.id is not None
    assert folder.name == "Documentos Fiscais"
    assert str(folder) == "Documentos Fiscais"


@pytest.mark.django_db
def test_folder_ordering(baker):
    """Pastas devem ser ordenadas por nome."""
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("drive.Folder", tenant=tenant, name="Zeta")
    baker.make("drive.Folder", tenant=tenant, name="Alpha")
    baker.make("drive.Folder", tenant=tenant, name="Medio")

    from drive.models import Folder
    folders = list(Folder.objects.filter(tenant=tenant).values_list("name", flat=True))
    assert folders == sorted(folders)
