from django.contrib import admin

from investments.models import Investment, InvestmentEntry


class InvestmentEntryInline(admin.TabularInline):
    model = InvestmentEntry
    extra = 0
    fields = ("entry_type", "amount", "date", "description")


@admin.register(Investment)
class InvestmentAdmin(admin.ModelAdmin):
    list_display = ("name", "investment_type", "broker", "is_active", "user")
    list_filter = ("investment_type", "is_active")
    search_fields = ("name", "broker")
    inlines = [InvestmentEntryInline]


@admin.register(InvestmentEntry)
class InvestmentEntryAdmin(admin.ModelAdmin):
    list_display = ("investment", "entry_type", "amount", "date")
    list_filter = ("entry_type",)
