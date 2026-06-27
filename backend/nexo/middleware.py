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
