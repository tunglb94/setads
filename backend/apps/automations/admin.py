from django.contrib import admin
from .models import AutomationRule, AutomationLog


@admin.register(AutomationRule)
class AutomationRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "metric", "operator", "threshold", "action", "is_active")
    list_filter = ("metric", "action", "is_active")
    list_editable = ("is_active",)


@admin.register(AutomationLog)
class AutomationLogAdmin(admin.ModelAdmin):
    list_display = ("adset_name", "trigger_source", "action_taken", "status", "created_at")
    list_filter = ("trigger_source", "status", "created_at")
    search_fields = ("adset_id", "adset_name")
    readonly_fields = ("created_at",)
    date_hierarchy = "created_at"
