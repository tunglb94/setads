from datetime import date, timedelta

from django.db.models import Sum, Avg, Count, Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AdSet, AdInsight, AdAccount, Ad
from .serializers import AdSetListSerializer, AdSetDetailSerializer, AdInsightSerializer
from .services import set_adset_status, sync_insights_to_db, sync_ads_to_db, sync_ad_post_mappings, get_ads_insights_for_adset, set_ad_status, MetaAPIError


class AdSetListView(generics.ListAPIView):
    serializer_class = AdSetListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AdSet.objects.select_related("campaign__account").filter(
            campaign__status="ACTIVE"
        ).order_by("-updated_at")

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter.upper())

        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(name__icontains=search)

        return qs


class AdSetDetailView(generics.RetrieveAPIView):
    serializer_class = AdSetDetailSerializer
    permission_classes = [IsAuthenticated]
    queryset = AdSet.objects.select_related("campaign__account")
    lookup_field = "adset_id"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_adset_status(request, adset_id: str):
    adset = generics.get_object_or_404(AdSet, adset_id=adset_id)
    new_status = "PAUSED" if adset.status == "ACTIVE" else "ACTIVE"

    try:
        set_adset_status(adset_id, new_status, access_token=adset.campaign.account.access_token)
        adset.status = new_status
        if new_status == "ACTIVE":
            adset.auto_paused = False
        adset.save(update_fields=["status", "auto_paused"])
        return Response({"adset_id": adset_id, "status": new_status})
    except MetaAPIError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def adset_insights(request, adset_id: str):
    days = int(request.query_params.get("days", 7))
    cutoff = date.today() - timedelta(days=days)
    qs = AdInsight.objects.filter(
        entity_id=adset_id, level=AdInsight.Level.ADSET, date__gte=cutoff
    ).order_by("date")
    return Response(AdInsightSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def account_stats_summary(request):
    """
    Aggregate stats across all AdSets for the given date range.
    Query param: days (default 3).
    """
    days = int(request.query_params.get("days", 3))
    cutoff = date.today() - timedelta(days=days)

    agg = AdInsight.objects.filter(
        level=AdInsight.Level.ADSET,
        date__gte=cutoff,
    ).aggregate(
        total_spend=Sum("spend"),
        total_conversions=Sum("conversions"),
        avg_roas=Avg("roas"),
        avg_cpa=Avg("cpa", filter=Q(cpa__gt=0)),
    )

    adset_counts = AdSet.objects.aggregate(
        active_adsets=Count("id", filter=Q(status="ACTIVE")),
        paused_adsets=Count("id", filter=Q(status="PAUSED")),
    )

    return Response({
        "total_spend": float(agg["total_spend"] or 0),
        "total_conversions": int(agg["total_conversions"] or 0),
        "avg_roas": float(agg["avg_roas"] or 0),
        "avg_cpa": float(agg["avg_cpa"] or 0),
        "active_adsets": adset_counts["active_adsets"],
        "paused_adsets": adset_counts["paused_adsets"],
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def adset_ads(request, adset_id: str):
    """Return aggregated per-ad metrics for all ads in an AdSet."""
    days = int(request.query_params.get("days", 7))
    data = get_ads_insights_for_adset(adset_id, days=days)
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_ad_status(request, ad_id: str):
    """Toggle a single Ad ACTIVE/PAUSED."""
    ad = generics.get_object_or_404(Ad, ad_id=ad_id)
    new_status = "PAUSED" if ad.status == "ACTIVE" else "ACTIVE"
    try:
        set_ad_status(ad_id, new_status, access_token=ad.adset.campaign.account.access_token)
        ad.status = new_status
        ad.save(update_fields=["status"])
        return Response({"ad_id": ad_id, "status": new_status})
    except MetaAPIError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def analyze_adset_ads(request, adset_id: str):
    """Trigger AI comparison of all ads in an AdSet. Returns analysis JSON."""
    from apps.ai_analyzer.services import analyze_ads_in_adset, LLMError
    days = int(request.data.get("days", 7))
    adset = generics.get_object_or_404(AdSet, adset_id=adset_id)
    ads = get_ads_insights_for_adset(adset_id, days=days)
    if not ads:
        return Response({"error": "Chưa có dữ liệu ad-level. Chạy Đồng bộ Meta trước."}, status=400)
    try:
        result = analyze_ads_in_adset(adset.name, ads, days=days)
        return Response(result)
    except LLMError as exc:
        return Response({"error": str(exc)}, status=502)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_now(request):
    """Trigger immediate sync from Meta API for all accounts."""
    accounts = AdAccount.objects.filter(is_active=True)
    if not accounts.exists():
        return Response({"error": "Không có tài khoản nào được cấu hình"}, status=400)

    total = 0
    for account in accounts:
        try:
            total += sync_insights_to_db(account, days=3)
            total += sync_ads_to_db(account, days=3)
            sync_ad_post_mappings(account)
        except Exception as exc:
            return Response({"error": str(exc)}, status=502)

    # Sync page comments after post mappings are updated
    from apps.messenger.models import FacebookPage
    from apps.messenger.services import sync_page_comments
    for page in FacebookPage.objects.filter(is_active=True):
        try:
            sync_page_comments(page, days=3)
        except Exception:
            pass  # don't fail sync_now if comments fail

    return Response({"synced_rows": total, "accounts": accounts.count()})
