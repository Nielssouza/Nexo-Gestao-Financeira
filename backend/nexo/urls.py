from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import RedirectView

from nexo.spa import ReactAppView

urlpatterns = [
    path('admin/', admin.site.urls),
    path("favicon.ico", RedirectView.as_view(url=f"{settings.STATIC_URL}icons/favicon.png", permanent=False), name="favicon"),
    path("api/v1/", include("nexo.api_urls")),
]

if settings.RUNSERVER:
    from django.conf.urls.static import static
    urlpatterns += [path("__reload__/", include("django_browser_reload.urls"))]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.SERVE_REACT_APP:
    urlpatterns += [
        re_path(
            r"^(?!api/|admin/|static/|media/|__reload__/)(?P<path>.*)$",
            ReactAppView.as_view(),
            name="react-app",
        ),
    ]
