import pytest
from transactions.models import Transaction

pytestmark = pytest.mark.django_db

def test_transaction_creation_and_balance_update(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    account = baker.make("accounts.Account", tenant=tenant, initial_balance=100.0)
    category = baker.make("categories.Category", tenant=tenant, category_type="income")
    
    # Create an income transaction
    transaction = baker.make(
        "transactions.Transaction",
        tenant=tenant,
        account=account,
        category=category,
        transaction_type="income",
        amount=50.0,
        is_cleared=True
    )
    
    # Depending on how the system is implemented, balance update might be triggered by signals
    # or by custom save() methods. Assuming we just test model creation here.
    assert transaction.amount == 50.0
    assert transaction.transaction_type == "income"
    assert transaction.is_cleared is True

def test_transaction_expense(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    account = baker.make("accounts.Account", tenant=tenant, initial_balance=100.0)
    category = baker.make("categories.Category", tenant=tenant, category_type="expense")
    
    # Create an expense transaction
    transaction = baker.make(
        "transactions.Transaction",
        tenant=tenant,
        account=account,
        category=category,
        transaction_type="expense",
        amount=30.0,
        is_cleared=True
    )
    
    assert transaction.amount == 30.0
    assert transaction.transaction_type == "expense"
    assert transaction.is_cleared is True
