from django.http import JsonResponse


class ApiOriginMiddleware:
    """
    Rejeita requisições à API que não venham do próprio servidor.

    Regras:
    - Requisições sem header Origin (ex: curl direto, server-to-server) passam
      se também não tiverem X-Requested-With — são tratadas como acesso direto
      e bloqueadas com 403.
    - Requisições com Origin diferente do host atual são bloqueadas (CORS já
      cobre browsers, mas este middleware atua como segunda camada).
    - Requisições internas (mesmo origin) precisam do header X-Requested-With.
    """

    API_PREFIX = "/api/v1/"
    SAFE_METHODS = frozenset(["GET", "HEAD", "OPTIONS"])

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith(self.API_PREFIX):
            error = self._check(request)
            if error:
                return JsonResponse({"detail": error}, status=403)
        return self.get_response(request)

    def _check(self, request):
        # OPTIONS (preflight) sempre passa — o CORS middleware cuida do resto
        if request.method == "OPTIONS":
            return None

        x_requested = request.META.get("HTTP_X_REQUESTED_WITH", "")
        origin = request.META.get("HTTP_ORIGIN", "")

        # Sem X-Requested-With → não é o frontend
        if x_requested.lower() != "xmlhttprequest":
            return "Acesso direto à API não permitido."

        # Se vier Origin, valida contra o próprio servidor OU origens CORS autorizadas
        if origin:
            from urllib.parse import urlparse
            from django.conf import settings as _settings
            origin_host = urlparse(origin).netloc
            server_host = request.get_host()
            allowed_origins = getattr(_settings, "CORS_ALLOWED_ORIGINS", [])
            if origin_host != server_host and origin not in allowed_origins:
                return "Origin não autorizada."

        return None


class ContentSecurityPolicyMiddleware:
    """Adds a Content-Security-Policy header to every response."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = self._policy()
        return response

    @staticmethod
    def _policy():
        directives = {
            "default-src": "'self'",
            "script-src": "'self'",
            "style-src": "'self' 'unsafe-inline'",
            "img-src": "'self' data: blob: https://*.amazonaws.com",
            "connect-src": "'self'",
            "font-src": "'self'",
            "media-src": "'self'",
            "worker-src": "'self'",
            "frame-ancestors": "'none'",
            "form-action": "'self'",
            "base-uri": "'self'",
        }
        return "; ".join(f"{key} {value}" for key, value in directives.items())
