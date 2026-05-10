from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import AutomationLog, AutomationRule
from .serializers import AutomationLogSerializer, AutomationRuleSerializer


class AutomationLogListView(generics.ListAPIView):
    serializer_class = AutomationLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AutomationLog.objects.order_by("-created_at")
        adset_id = self.request.query_params.get("adset_id")
        if adset_id:
            qs = qs.filter(adset_id=adset_id)
        return qs[:100]


class AutomationRuleListCreateView(generics.ListCreateAPIView):
    serializer_class = AutomationRuleSerializer
    permission_classes = [IsAuthenticated]
    queryset = AutomationRule.objects.all().order_by("id")


class AutomationRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AutomationRuleSerializer
    permission_classes = [IsAuthenticated]
    queryset = AutomationRule.objects.all()
