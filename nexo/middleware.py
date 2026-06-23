class ContentSecurityPolicyMiddleware:
    """Adiciona o header Content-Security-Policy em todas as respostas."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Não sobrescreve se a view já definiu (ex: admin customizado)
        if "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = self._policy()
        return response

    @staticmethod
    def _policy():
        directives = {
            "default-src": "'self'",
            # Tailwind CDN e htmx via CDN; unsafe-inline necessário para scripts inline do Django/HTMX
            "script-src": "'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com",
            # Tailwind injeta estilos inline
            "style-src": "'self' 'unsafe-inline'",
            # Imagens locais + data URIs (previews de logo) + blob (Playwright)
            "img-src": "'self' data: blob:",
            # Fetch/XHR apenas para o próprio domínio
            "connect-src": "'self'",
            "font-src": "'self'",
            "media-src": "'self'",
            # Bloqueia a página de ser embutida em iframes (XSS via frame)
            "frame-ancestors": "'none'",
            # Formulários só submetem para o próprio domínio
            "form-action": "'self'",
            # Previne injeção de <base href="...">
            "base-uri": "'self'",
        }
        return "; ".join(f"{k} {v}" for k, v in directives.items())
