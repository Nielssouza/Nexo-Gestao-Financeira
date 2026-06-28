from tenants.services import get_request_tenant


class CurrentTenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path_info.startswith("/api/"):
            request.tenant = None
        else:
            request.tenant = get_request_tenant(request)
        return self.get_response(request)
