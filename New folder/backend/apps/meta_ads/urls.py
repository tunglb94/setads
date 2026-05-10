from django.urls import path
from . import views

urlpatterns = [
    path("adsets/", views.AdSetListView.as_view(), name="adset-list"),
    path("adsets/<str:adset_id>/", views.AdSetDetailView.as_view(), name="adset-detail"),
    path("adsets/<str:adset_id>/toggle/", views.toggle_adset_status, name="adset-toggle"),
    path("adsets/<str:adset_id>/insights/", views.adset_insights, name="adset-insights"),
    path("adsets/<str:adset_id>/ads/", views.adset_ads, name="adset-ads"),
    path("adsets/<str:adset_id>/ads/analyze/", views.analyze_adset_ads, name="adset-ads-analyze"),
    path("ads/<str:ad_id>/toggle/", views.toggle_ad_status, name="ad-toggle"),
    path("stats/summary/", views.account_stats_summary, name="stats-summary"),
    path("sync/", views.sync_now, name="sync-now"),
]
