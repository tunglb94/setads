from django.apps import AppConfig


class MetaAdsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.meta_ads"

    def ready(self):
        from django.db.models.signals import post_migrate
        post_migrate.connect(_register_periodic_tasks, sender=self)


def _register_periodic_tasks(sender, **kwargs):
    try:
        from django_celery_beat.models import PeriodicTask, IntervalSchedule
        import json

        schedule_15m, _ = IntervalSchedule.objects.get_or_create(
            every=15, period=IntervalSchedule.MINUTES
        )
        PeriodicTask.objects.update_or_create(
            name="Sync Meta Ads Insights (15min)",
            defaults={
                "interval": schedule_15m,
                "task": "meta_ads.sync_all_accounts",
                "args": json.dumps([3]),
                "enabled": True,
            },
        )
    except Exception:
        pass
