from django.urls import path
from . import views

urlpatterns = [
    path("webhook/messenger/", views.MessengerWebhookView.as_view(), name="messenger-webhook"),
    path("messenger/setup/", views.setup_pages, name="messenger-setup"),
    path("messenger/sync-comments/", views.sync_comments, name="sync-comments"),
    path("leads/", views.ConversationListView.as_view(), name="lead-list"),
    path("leads/comments/", views.PageCommentListView.as_view(), name="lead-comments"),
    path("leads/stats/", views.lead_stats_by_adset, name="lead-stats"),
    path("leads/deep-funnel/", views.deep_funnel_by_ad, name="deep-funnel"),
    path("leads/score-all/", views.score_all_unscored, name="score-all"),
    path("appointments/", views.AppointmentListView.as_view(), name="appointment-list"),
    path("appointments/scan/", views.scan_appointments, name="appointment-scan"),
    path("appointments/ad-stats/", views.appointment_ad_stats, name="appointment-ad-stats"),
    path("appointments/<int:pk>/", views.AppointmentDetailView.as_view(), name="appointment-detail"),
]
