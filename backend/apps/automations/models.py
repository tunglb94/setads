from django.db import models


class AutomationRule(models.Model):
    """User-defined rules that drive automated actions."""

    class Metric(models.TextChoices):
        CPA = "cpa", "Cost Per Action"
        ROAS = "roas", "ROAS"
        CTR = "ctr", "CTR"
        SPEND = "spend", "Spend"
        CPC = "cpc", "CPC"

    class Operator(models.TextChoices):
        GT = "gt", "Greater Than"
        LT = "lt", "Less Than"
        GTE = "gte", "Greater Than or Equal"
        LTE = "lte", "Less Than or Equal"

    class Action(models.TextChoices):
        PAUSE = "PAUSE", "Pause AdSet"
        SCALE_BUDGET = "SCALE_BUDGET", "Scale Budget"
        ALERT = "ALERT", "Send Alert"

    name = models.CharField(max_length=255)
    metric = models.CharField(max_length=20, choices=Metric.choices)
    operator = models.CharField(max_length=5, choices=Operator.choices)
    threshold = models.FloatField()
    action = models.CharField(max_length=20, choices=Action.choices)
    scale_factor = models.FloatField(default=1.5, help_text="Multiply budget by this when SCALE_BUDGET")
    lookback_days = models.PositiveSmallIntegerField(default=3)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name}: {self.metric} {self.operator} {self.threshold} → {self.action}"

    class Meta:
        db_table = "automation_rules"


class AutomationLog(models.Model):
    """Immutable audit trail of every automated action taken."""

    class TriggerSource(models.TextChoices):
        RULE = "RULE", "Rule Engine"
        AI = "AI", "AI Decision"
        ANOMALY = "ANOMALY", "Anomaly Detection"
        MANUAL = "MANUAL", "Manual Trigger"

    class Status(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        FAILED = "FAILED", "Failed"
        SKIPPED = "SKIPPED", "Skipped"

    adset_id = models.CharField(max_length=50, db_index=True)
    adset_name = models.CharField(max_length=255, blank=True)
    rule = models.ForeignKey(AutomationRule, null=True, blank=True, on_delete=models.SET_NULL)
    trigger_source = models.CharField(max_length=10, choices=TriggerSource.choices)
    action_taken = models.CharField(max_length=50)
    ai_decision = models.CharField(max_length=10, blank=True)
    ai_reasoning = models.TextField(blank=True)
    metric_snapshot = models.JSONField(default=dict)  # {cpa, roas, spend, ...}
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCESS)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "automation_logs"
        ordering = ["-created_at"]
