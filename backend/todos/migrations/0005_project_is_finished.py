from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('todos', '0004_todoitem_assigned_to'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='is_finished',
            field=models.BooleanField(default=False, verbose_name='Finalizado'),
        ),
        migrations.AddField(
            model_name='project',
            name='finished_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Finalizado em'),
        ),
    ]
