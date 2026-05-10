from rest_framework import serializers
from .models import AutomationLog, AutomationRule


class AutomationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationLog
        fields = "__all__"


class AutomationRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationRule
        fields = "__all__"
