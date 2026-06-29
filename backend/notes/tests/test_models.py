import pytest


@pytest.mark.django_db
def test_note_creation(baker):
    """Nota deve ser criada com os campos corretos."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    note = baker.make(
        "notes.Note",
        user=user,
        tenant=tenant,
        title="Lembrete",
        content="Conteudo importante",
        is_pinned=True,
    )

    assert note.id is not None
    assert note.title == "Lembrete"
    assert note.content == "Conteudo importante"
    assert note.is_pinned is True
    assert str(note) == "Lembrete"


@pytest.mark.django_db
def test_note_str_uses_content_when_no_title(baker):
    """Sem titulo, __str__ deve usar as primeiras 50 chars do conteudo."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    note = baker.make(
        "notes.Note",
        user=user,
        tenant=tenant,
        title="",
        content="Texto longo sem titulo para verificar truncamento",
    )

    assert str(note) == "Texto longo sem titulo para verificar truncamento"


@pytest.mark.django_db
def test_note_default_color(baker):
    """Cor padrao da nota deve ser amarela (#fef08a)."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    note = baker.make("notes.Note", user=user, tenant=tenant, content="Test")

    assert note.color == "#fef08a"
    assert note.is_pinned is False
