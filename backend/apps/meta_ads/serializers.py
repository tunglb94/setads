from datetime import date, timedelta

from django.db.models import Sum, Avg
from rest_framework import serializers

from .models import AdAccount, Campaign, AdSet, Ad, AdInsight


class AdInsightSerializer(serializers.ModelSerializer):
    cost_per_message = serializers.SerializerMethodField()

    class Meta:
        model = AdInsight
        fields = [
            "date", "spend", "impressions", "clicks", "conversions",
            "message_count", "comment_count",
            "ctr", "cpc", "cpa", "roas", "conversion_value", "frequency",
            "cost_per_message",
        ]

    def get_cost_per_message(self, obj):
        total = (obj.message_count or 0) + (obj.comment_count or 0)
        if total > 0 and obj.spend:
            return round(float(obj.spend) / total)
        return None


class AdSetListSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source="campaign.name", read_only=True)
    campaign_status = serializers.CharField(source="campaign.status", read_only=True)
    account_name = serializers.CharField(source="campaign.account.name", read_only=True)
    campaign_daily_budget = serializers.DecimalField(
        source="campaign.daily_budget", max_digits=15, decimal_places=2, read_only=True
    )
    latest_insight = serializers.SerializerMethodField()

    class Meta:
        model = AdSet
        fields = [
            "id", "adset_id", "name", "status", "campaign_name", "campaign_status", "account_name",
            "daily_budget", "campaign_daily_budget",
            "ai_decision", "ai_reasoning", "ai_confidence",
            "ai_analyzed_at", "auto_paused", "latest_insight",
        ]

    def get_latest_insight(self, obj):
        ctx = self.context
        date_from = ctx.get("date_from")
        date_to = ctx.get("date_to")
        days = ctx.get("days", 3)

        qs = AdInsight.objects.filter(entity_id=obj.adset_id, level=AdInsight.Level.ADSET)
        if date_from or date_to:
            if date_from:
                qs = qs.filter(date__gte=date_from)
            if date_to:
                qs = qs.filter(date__lte=date_to)
        else:
            cutoff = date.today() - timedelta(days=days)
            qs = qs.filter(date__gte=cutoff)

        agg = qs.aggregate(
            total_spend=Sum("spend"),
            total_impressions=Sum("impressions"),
            total_clicks=Sum("clicks"),
            total_conversions=Sum("conversions"),
            total_message_count=Sum("message_count"),
            total_comment_count=Sum("comment_count"),
            avg_ctr=Avg("ctr"),
            avg_cpc=Avg("cpc"),
            avg_cpa=Avg("cpa"),
            avg_roas=Avg("roas"),
            avg_frequency=Avg("frequency"),
        )

        if agg["total_spend"] is None:
            return None

        total_mess = (agg["total_message_count"] or 0) + (agg["total_comment_count"] or 0)
        return {
            "spend": float(agg["total_spend"] or 0),
            "impressions": int(agg["total_impressions"] or 0),
            "clicks": int(agg["total_clicks"] or 0),
            "conversions": int(agg["total_conversions"] or 0),
            "message_count": int(agg["total_message_count"] or 0),
            "comment_count": int(agg["total_comment_count"] or 0),
            "ctr": float(agg["avg_ctr"] or 0),
            "cpc": float(agg["avg_cpc"] or 0),
            "cpa": float(agg["avg_cpa"] or 0),
            "roas": float(agg["avg_roas"] or 0),
            "frequency": float(agg["avg_frequency"] or 0),
            "cost_per_message": round(float(agg["total_spend"]) / total_mess) if total_mess > 0 else None,
        }


class AdSetDetailSerializer(AdSetListSerializer):
    insights = serializers.SerializerMethodField()

    class Meta(AdSetListSerializer.Meta):
        fields = AdSetListSerializer.Meta.fields + ["insights"]

    def get_insights(self, obj):
        qs = AdInsight.objects.filter(
            entity_id=obj.adset_id, level=AdInsight.Level.ADSET
        ).order_by("-date")[:14]
        return AdInsightSerializer(qs, many=True).data
