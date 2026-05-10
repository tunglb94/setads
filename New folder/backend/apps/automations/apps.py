from django.apps import AppConfig


class AutomationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.automations"

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
            name="Run Automation Pipeline (15min)",
            defaults={
                "interval": schedule_15m,
                "task": "automations.run_automation_pipeline",
                "args": json.dumps([]),
                "enabled": True,
            },
        )
    except Exception:
        pass
