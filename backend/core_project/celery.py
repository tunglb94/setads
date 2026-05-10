import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core_project.settings")

app = Celery("super_admin_digital")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
