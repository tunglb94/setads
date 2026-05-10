from django.urls import path
from . import views

urlpatterns = [
    path("automation/logs/", views.AutomationLogListView.as_view(), name="automation-logs"),
    path("automation/rules/", views.AutomationRuleListCreateView.as_view(), name="automation-rules"),
    path("automation/rules/<int:pk>/", views.AutomationRuleDetailView.as_view(), name="automation-rule-detail"),
]
