import pytest
from decimal import Decimal


@pytest.mark.django_db
def test_shopping_list_creation(baker):
    """Lista de compras deve ser criada com campos corretos."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    sl = baker.make(
        "shopping.ShoppingList",
        user=user,
        tenant=tenant,
        name="Supermercado Semana",
        notes="Compras da semana",
    )

    assert sl.id is not None
    assert sl.name == "Supermercado Semana"
    assert str(sl) == "Supermercado Semana"


@pytest.mark.django_db
def test_shopping_list_pending_and_purchased_count(baker):
    """pending_count e purchased_count devem contar itens corretamente."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    sl = baker.make("shopping.ShoppingList", user=user, tenant=tenant, name="Lista Teste")

    # 2 itens pendentes, 1 comprado
    baker.make("shopping.ShoppingItem", user=user, shopping_list=sl, title="Arroz", is_purchased=False, quantity=1)
    baker.make("shopping.ShoppingItem", user=user, shopping_list=sl, title="Feijao", is_purchased=False, quantity=1)
    baker.make("shopping.ShoppingItem", user=user, shopping_list=sl, title="Leite", is_purchased=True, quantity=1, unit_price=Decimal("5.00"))

    assert sl.pending_count == 2
    assert sl.purchased_count == 1


@pytest.mark.django_db
def test_shopping_list_unique_name_per_tenant(baker):
    """Nomes de listas devem ser unicos por tenant."""
    from django.db import IntegrityError

    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    baker.make("shopping.ShoppingList", user=user, tenant=tenant, name="Lista Duplicada")

    with pytest.raises(IntegrityError):
        baker.make("shopping.ShoppingList", user=user, tenant=tenant, name="Lista Duplicada")
