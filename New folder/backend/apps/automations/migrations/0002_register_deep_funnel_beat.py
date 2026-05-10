"""Register deep_funnel_loop periodic task in Celery Beat (runs every 30 min)."""
from django.db import migrations


def add_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=30,
        period="minutes",
    )
    PeriodicTask.objects.update_or_create(
        name="Deep Funnel Loop — True CPL per ad",
        defaults={
            "task": "automations.deep_funnel_loop",
            "interval": schedule,
            "enabled": True,
        },
    )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(task="automations.deep_funnel_loop").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("automations", "0001_initial"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [
        migrations.RunPython(add_periodic_task, remove_periodic_task),
    ]
