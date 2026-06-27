from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponseServerError
from django.views import View


class ReactAppView(View):
    def get(self, request, path=""):
        if path and Path(path).suffix:
            raise Http404

        index_path = settings.FRONTEND_DIST_DIR / "index.html"
        if not index_path.exists():
            return HttpResponseServerError(
                f"React build not found at {index_path}. "
                "Run `npm run build` from the repository root and deploy again."
            )

        return FileResponse(index_path.open("rb"), content_type="text/html")
