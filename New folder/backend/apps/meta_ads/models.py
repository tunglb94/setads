from django.db import models
from django.utils import timezone


class AdAccount(models.Model):
    account_id = models.CharField(max_length=50, unique=True)  # act_XXXXXXXXX
    name = models.CharField(max_length=255)
    access_token = models.TextField()
    currency = models.CharField(max_length=10, default="VND")
    timezone_name = models.CharField(max_length=50, default="Asia/Ho_Chi_Minh")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.account_id})"

    class Meta:
        db_table = "ad_accounts"


class Campaign(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        PAUSED = "PAUSED", "Paused"
        DELETED = "DELETED", "Deleted"
        ARCHIVED = "ARCHIVED", "Archived"

    account = models.ForeignKey(AdAccount, on_delete=models.CASCADE, related_name="campaigns")
    campaign_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    objective = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    daily_budget = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    lifetime_budget = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.campaign_id})"

    class Meta:
        db_table = "campaigns"


class AdSet(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        PAUSED = "PAUSED", "Paused"
        DELETED = "DELETED", "Deleted"
        ARCHIVED = "ARCHIVED", "Archived"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="adsets")
    adset_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    daily_budget = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    lifetime_budget = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    optimization_goal = models.CharField(max_length=50, blank=True)
    billing_event = models.CharField(max_length=50, blank=True)
    # AI & automation state
    ai_decision = models.CharField(max_length=20, blank=True)  # PAUSE / KEEP / SCALE / CREATIVE_REFRESH
    ai_reasoning = models.TextField(blank=True)
    ai_confidence = models.FloatField(null=True, blank=True)
    ai_analyzed_at = models.DateTimeField(null=True, blank=True)
    auto_paused = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.adset_id})"

    class Meta:
        db_table = "adsets"


class Ad(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        PAUSED = "PAUSED", "Paused"
        DELETED = "DELETED", "Deleted"
        ARCHIVED = "ARCHIVED", "Archived"

    adset = models.ForeignKey(AdSet, on_delete=models.CASCADE, related_name="ads")
    ad_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    creative_id = models.CharField(max_length=50, blank=True)
    promoted_post_id = models.CharField(max_length=100, blank=True, db_index=True)
    # AI analysis per-ad
    ai_decision = models.CharField(max_length=20, blank=True)  # PAUSE / KEEP / SCALE
    ai_reasoning = models.TextField(blank=True)
    ai_confidence = models.FloatField(null=True, blank=True)
    ai_analyzed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.ad_id})"

    class Meta:
        db_table = "ads"


class AdInsight(models.Model):
    """Snapshot metrics per day per entity (AdSet or Ad level)."""

    class Level(models.TextChoices):
        CAMPAIGN = "campaign", "Campaign"
        ADSET = "adset", "AdSet"
        AD = "ad", "Ad"

    level = models.CharField(max_length=10, choices=Level.choices, default=Level.ADSET)
    # Generic FK approach — store the Meta ID string directly
    entity_id = models.CharField(max_length=50, db_index=True)
    entity_name = models.CharField(max_length=255, blank=True)
    date = models.DateField(db_index=True)

    spend = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    impressions = models.PositiveBigIntegerField(default=0)
    clicks = models.PositiveBigIntegerField(default=0)
    reach = models.PositiveBigIntegerField(default=0)
    conversions = models.PositiveIntegerField(default=0)
    comment_count = models.PositiveIntegerField(default=0)   # "Bình luận bài viết" from Meta actions
    message_count = models.PositiveIntegerField(default=0)   # "Lượt bắt đầu hội thoại" from Meta actions
    conversion_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    frequency = models.DecimalField(max_digits=8, decimal_places=4, default=0)

    # Computed / cached
    ctr = models.DecimalField(max_digits=8, decimal_places=4, default=0)   # %
    cpc = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cpm = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cpa = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    roas = models.DecimalField(max_digits=10, decimal_places=4, default=0)

    fetched_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "ad_insights"
        unique_together = ("entity_id", "level", "date")
        ordering = ["-date"]

    def compute_derived(self):
        self.ctr = (self.clicks / self.impressions * 100) if self.impressions else 0
        self.cpc = (self.spend / self.clicks) if self.clicks else 0
        self.cpm = (self.spend / self.impressions * 1000) if self.impressions else 0
        self.cpa = (self.spend / self.conversions) if self.conversions else 0
        self.roas = (self.conversion_value / self.spend) if self.spend else 0
