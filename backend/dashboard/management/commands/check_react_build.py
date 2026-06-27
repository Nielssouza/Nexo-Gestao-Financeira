from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Validate that the compiled React app is present when Django serves it."

    def handle(self, *args, **options):
        if not settings.SERVE_REACT_APP:
            self.stdout.write("React app serving is disabled.")
            return

        index_path = settings.FRONTEND_DIST_DIR / "index.html"
        if not index_path.exists():
            raise CommandError(
                f"React build not found at {index_path}. "
                "Check that the Heroku Node.js buildpack runs before the Python buildpack."
            )

        self.stdout.write(self.style.SUCCESS(f"React build found at {index_path}"))
