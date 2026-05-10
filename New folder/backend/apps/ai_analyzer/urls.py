from django.urls import path
from . import views

urlpatterns = [
    path("adsets/<str:adset_id>/analyze/", views.analyze_adset_now, name="adset-analyze"),
    path("tasks/<str:task_id>/", views.get_task_result, name="task-result"),
    path("ai_analyzer/stream/", views.stream_ad_analysis, name="stream-ad-analysis"),
]
