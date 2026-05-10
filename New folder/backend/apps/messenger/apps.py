from django.apps import AppConfig


class MessengerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.messenger"

    def ready(self):
        from django.db.models.signals import post_migrate
        post_migrate.connect(_register_periodic_tasks, sender=self)


def _register_periodic_tasks(sender, **kwargs):
    try:
        from django_celery_beat.models import PeriodicTask, IntervalSchedule
        import json

        schedule_30m, _ = IntervalSchedule.objects.get_or_create(
            every=30, period=IntervalSchedule.MINUTES
        )
        PeriodicTask.objects.update_or_create(
            name="Sync Messenger Conversations (30min)",
            defaults={
                "interval": schedule_30m,
                "task": "messenger.sync_all_pages",
                "args": json.dumps([]),
                "enabled": True,
            },
        )
    except Exception:
        pass
