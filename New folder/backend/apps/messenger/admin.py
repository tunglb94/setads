from django.contrib import admin
from .models import FacebookPage, Conversation, Message, LeadScore


@admin.register(FacebookPage)
class FacebookPageAdmin(admin.ModelAdmin):
    list_display = ("name", "page_id", "ad_account", "is_active")


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = (
        "user_name", "page", "phone_number", "is_qualified",
        "referral_adset_id", "message_count", "last_message_at",
    )
    list_filter = ("is_qualified", "page", "source")
    search_fields = ("user_name", "psid", "phone_number", "referral_adset_id")
    readonly_fields = ("created_at", "updated_at")


@admin.register(LeadScore)
class LeadScoreAdmin(admin.ModelAdmin):
    list_display = ("conversation", "score", "intent_level", "has_phone", "has_budget_signal")
    list_filter = ("intent_level",)
