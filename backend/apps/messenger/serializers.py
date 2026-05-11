from rest_framework import serializers
from .models import Conversation, Message, LeadScore, PageComment, Appointment


class LeadScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeadScore
        fields = ["score", "intent_level", "ai_summary", "has_phone",
                  "has_budget_signal", "has_urgency_signal", "has_appointment",
                  "is_spam", "analyzed_at"]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["message_id", "direction", "text", "sent_at"]


class PageCommentSerializer(serializers.ModelSerializer):
    page_name = serializers.CharField(source="page.name", read_only=True)

    class Meta:
        model = PageComment
        fields = [
            "id", "comment_id", "post_id", "adset_id", "ad_id",
            "user_name", "text", "phone_number", "is_qualified",
            "commented_at", "page_name",
        ]


class AppointmentSerializer(serializers.ModelSerializer):
    page_name = serializers.CharField(source="page.name", read_only=True)
    patient_name_display = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            "id", "page_name", "adset_id", "patient_name", "patient_name_display",
            "phone", "appointment_date", "appointment_time", "service",
            "status", "detected_at",
        ]

    def get_patient_name_display(self, obj):
        if obj.patient_name:
            return obj.patient_name
        if obj.conversation and obj.conversation.user_name:
            return obj.conversation.user_name
        return "Khách hàng"


class ConversationSerializer(serializers.ModelSerializer):
    lead_score = LeadScoreSerializer(read_only=True)
    page_name = serializers.CharField(source="page.name", read_only=True)
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = [
            "id", "conversation_id", "psid", "user_name", "page_name",
            "referral_ad_id", "referral_adset_id", "referral_campaign_id",
            "phone_number", "email", "is_qualified",
            "message_count", "first_message_at", "last_message_at",
            "lead_score", "messages",
        ]
