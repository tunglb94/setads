from rest_framework import serializers
from .models import AdAccount, Campaign, AdSet, Ad, AdInsight


class AdInsightSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdInsight
        fields = [
            "date", "spend", "impressions", "clicks", "conversions",
            "ctr", "cpc", "cpa", "roas", "conversion_value", "frequency",
        ]


class AdSetListSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    account_name = serializers.CharField(source="campaign.account.name", read_only=True)
    latest_insight = serializers.SerializerMethodField()

    class Meta:
        model = AdSet
        fields = [
            "id", "adset_id", "name", "status", "campaign_name", "account_name",
            "daily_budget", "ai_decision", "ai_reasoning", "ai_confidence",
            "ai_analyzed_at", "auto_paused", "latest_insight",
        ]

    def get_latest_insight(self, obj):
        insight = AdInsight.objects.filter(
            entity_id=obj.adset_id, level=AdInsight.Level.ADSET
        ).order_by("-date").first()
        return AdInsightSerializer(insight).data if insight else None


class AdSetDetailSerializer(AdSetListSerializer):
    insights = serializers.SerializerMethodField()

    class Meta(AdSetListSerializer.Meta):
        fields = AdSetListSerializer.Meta.fields + ["insights"]

    def get_insights(self, obj):
        qs = AdInsight.objects.filter(
            entity_id=obj.adset_id, level=AdInsight.Level.ADSET
        ).order_by("-date")[:14]
        return AdInsightSerializer(qs, many=True).data
