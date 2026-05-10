from django.contrib import admin
from .models import AdAccount, Campaign, AdSet, Ad, AdInsight


@admin.register(AdAccount)
class AdAccountAdmin(admin.ModelAdmin):
    list_display = ("name", "account_id", "currency", "is_active")
    list_filter = ("is_active", "currency")


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "campaign_id", "status", "objective", "account")
    list_filter = ("status", "account")
    search_fields = ("name", "campaign_id")


@admin.register(AdSet)
class AdSetAdmin(admin.ModelAdmin):
    list_display = ("name", "adset_id", "status", "ai_decision", "auto_paused", "campaign")
    list_filter = ("status", "ai_decision", "auto_paused")
    search_fields = ("name", "adset_id")
    readonly_fields = ("ai_decision", "ai_reasoning", "ai_analyzed_at")


@admin.register(AdInsight)
class AdInsightAdmin(admin.ModelAdmin):
    list_display = ("entity_id", "entity_name", "level", "date", "spend", "cpa", "roas")
    list_filter = ("level", "date")
    search_fields = ("entity_id", "entity_name")
    date_hierarchy = "date"
