from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("messenger", "0005_appointment_ad_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="ConversationAdTouchpoint",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ad_id", models.CharField(db_index=True, max_length=50)),
                ("adset_id", models.CharField(blank=True, max_length=50)),
                ("campaign_id", models.CharField(blank=True, max_length=50)),
                ("clicked_at", models.DateTimeField()),
                (
                    "conversation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="ad_touchpoints",
                        to="messenger.conversation",
                    ),
                ),
            ],
            options={
                "db_table": "conversation_ad_touchpoints",
                "ordering": ["-clicked_at"],
            },
        ),
    ]
