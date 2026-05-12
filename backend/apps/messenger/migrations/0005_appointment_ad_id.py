from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("messenger", "0004_appointment_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="ad_id",
            field=models.CharField(blank=True, db_index=True, default="", max_length=50),
            preserve_default=False,
        ),
    ]
