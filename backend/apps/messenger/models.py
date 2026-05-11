"""
Messenger Lead models.

Flow: Facebook Page Inbox → webhook/polling → extract leads → correlate with Ad ID
Vietnamese media buyers run lead-gen ads where prospects message the page directly.
We capture those conversations, extract phone numbers, and correlate back to the ad
that drove the message (via referral_adset_id from the webhook payload).
"""
from django.db import models


class FacebookPage(models.Model):
    page_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    page_access_token = models.TextField()
    ad_account = models.ForeignKey(
        "meta_ads.AdAccount",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pages",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.page_id})"

    class Meta:
        db_table = "fb_pages"


class Conversation(models.Model):
    class Source(models.TextChoices):
        WEBHOOK = "WEBHOOK", "Webhook (real-time)"
        POLLING = "POLLING", "API Polling"

    page = models.ForeignKey(FacebookPage, on_delete=models.CASCADE, related_name="conversations")
    conversation_id = models.CharField(max_length=100, unique=True)
    psid = models.CharField(max_length=50, db_index=True)  # Page-Scoped User ID
    user_name = models.CharField(max_length=255, blank=True)
    # Which ad brought this user (from webhook referral)
    referral_ad_id = models.CharField(max_length=50, blank=True, db_index=True)
    referral_adset_id = models.CharField(max_length=50, blank=True, db_index=True)
    referral_campaign_id = models.CharField(max_length=50, blank=True)
    # Extracted lead data
    phone_number = models.CharField(max_length=20, blank=True)
    email = models.CharField(max_length=255, blank=True)
    is_qualified = models.BooleanField(default=False)  # has phone or email
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.WEBHOOK)
    first_message_at = models.DateTimeField(null=True, blank=True)
    last_message_at = models.DateTimeField(null=True, blank=True)
    message_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "messenger_conversations"
        ordering = ["-last_message_at"]

    def __str__(self):
        return f"{self.user_name or self.psid} → {self.page.name}"


class Message(models.Model):
    class Direction(models.TextChoices):
        INBOUND = "IN", "From User"
        OUTBOUND = "OUT", "From Page"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    message_id = models.CharField(max_length=100, unique=True)
    direction = models.CharField(max_length=3, choices=Direction.choices)
    text = models.TextField(blank=True)
    attachments = models.JSONField(default=list)  # [{type, url}]
    sent_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "messenger_messages"
        ordering = ["sent_at"]


class PageComment(models.Model):
    """Comment on a page post — extracted as a lead (beauty clinic: commenters = potential clients)."""
    page = models.ForeignKey(FacebookPage, on_delete=models.CASCADE, related_name="page_comments")
    comment_id = models.CharField(max_length=100, unique=True)
    post_id = models.CharField(max_length=100, db_index=True)
    adset_id = models.CharField(max_length=50, blank=True, db_index=True)
    ad_id = models.CharField(max_length=50, blank=True)
    user_name = models.CharField(max_length=255, blank=True)
    text = models.TextField()
    phone_number = models.CharField(max_length=20, blank=True)
    is_qualified = models.BooleanField(default=False)
    commented_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "page_comments"
        ordering = ["-commented_at"]

    def __str__(self):
        return f"{self.user_name}: {self.text[:50]}"


class Appointment(models.Model):
    """
    Appointment confirmed by staff — detected from outbound message pattern
    "E xin xác nhận lịch hẹn với chị..."
    """
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Đã đặt lịch"
        COMPLETED = "COMPLETED", "Đã thực hiện"
        CANCELLED = "CANCELLED", "Đã huỷ"

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="appointments", null=True, blank=True
    )
    page = models.ForeignKey(FacebookPage, on_delete=models.CASCADE)
    adset_id = models.CharField(max_length=50, blank=True, db_index=True)
    patient_name = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    appointment_date = models.DateField(null=True, blank=True)
    appointment_time = models.CharField(max_length=30, blank=True)
    service = models.TextField(blank=True)
    raw_message = models.TextField()
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.SCHEDULED)
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "appointments"
        ordering = ["-detected_at"]

    def __str__(self):
        return f"{self.patient_name or '?'} | {self.appointment_date} | {self.service[:30]}"


class LeadScore(models.Model):
    """
    AI-generated quality score for a lead conversation.
    Helps prioritize which leads to follow up on.
    """
    conversation = models.OneToOneField(
        Conversation, on_delete=models.CASCADE, related_name="lead_score"
    )
    score = models.PositiveSmallIntegerField(default=0)  # 0-100
    intent_level = models.CharField(
        max_length=10,
        choices=[("HOT", "Hot"), ("WARM", "Warm"), ("COLD", "Cold")],
        default="COLD",
    )
    ai_summary = models.TextField(blank=True)  # brief summary of conversation
    has_phone = models.BooleanField(default=False)
    has_appointment = models.BooleanField(default=False)
    is_spam = models.BooleanField(default=False)
    has_budget_signal = models.BooleanField(default=False)
    has_urgency_signal = models.BooleanField(default=False)
    analyzed_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lead_scores"
