from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0002_page_comments"),
    ]

    operations = [
        migrations.AddField(
            model_name="leadscore",
            name="has_appointment",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="leadscore",
            name="is_spam",
            field=models.BooleanField(default=False),
        ),
    ]
