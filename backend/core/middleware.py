from django.http import JsonResponse


class FinancialMaskingMiddleware:
    """Hides monetary values from superusers browsing a tenant they don't belong to.

    Views/mixins that resolve the active tenant (TenantQuerySetMixin.get_tenant,
    DashboardView) set request.mask_financial_values = True when the requester
    is a superuser without a real membership in that tenant. This middleware
    then blanks out any known monetary field, anywhere in the response body,
    so support/admin access never exposes real financial data.
    """

    MASKED_FIELDS = frozenset({
        "amount", "balance", "initial_balance", "credit_limit",
        "gross_value", "deductions", "calculation_base",
        "iss_value", "pis_value", "cofins_value", "csll_value", "ir_value", "inss_value",
        "total_withheld", "net_value",
        "total_invested", "total_withdrawn", "total_earnings", "net_invested",
        "user_balance", "monthly_income", "monthly_expense", "monthly_balance",
        "credit_available", "investments_total", "investments_earnings",
        "investments_month_deposited", "investments_month_withdrawn", "investments_month_earnings",
        "pending_expense_total", "credit_card_open_total", "credit_card_month_total",
        "credit_card_limit", "consolidated_balance", "balance_after_pending",
        "total_gross", "total",
        "current_balance", "pending_bank_total", "monthly_income_total", "monthly_expense_total",
    })

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_template_response(self, request, response):
        # DRF's Response.render() — which serializes .data into .content —
        # runs inside _get_response, before __call__ gets the response back.
        # process_template_response is the hook Django guarantees runs
        # *before* that render(), so mutating .data here actually reaches
        # the bytes sent to the client (mutating it in __call__ would be a
        # silent no-op: .content is already baked by then).
        if getattr(request, "mask_financial_values", False) and hasattr(response, "data"):
            self._mask(response.data)
        return response

    @classmethod
    def _mask(cls, node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key in cls.MASKED_FIELDS and value is not None:
                    node[key] = None
                else:
                    cls._mask(value)
        elif isinstance(node, list):
            for item in node:
                cls._mask(item)


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
