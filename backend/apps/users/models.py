from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        MEDIA_BUYER = "MEDIA_BUYER", "Media Buyer"
        VIEWER = "VIEWER", "Viewer"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    telegram_chat_id = models.CharField(max_length=50, blank=True)

    class Meta:
        db_table = "users"
