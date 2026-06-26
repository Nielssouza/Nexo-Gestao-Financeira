import json
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from rest_framework import generics, parsers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api_mixins import get_user_tenant
from common.throttles import CepLookupThrottle
from tenants.models import NfseCredential, TenantMembership
from tenants.serializers import NfseCredentialSerializer, TenantMembershipSerializer, TenantSerializer


class TenantProfileView(generics.RetrieveUpdateAPIView):
    """
    Retrieve and update the authenticated user's tenant profile.
    Supports multipart/form-data for logo uploads.
    Send clear_logo=true to remove the current logo (mirrors TenantUpdateView SSR).
    """
    serializer_class = TenantSerializer
    parser_classes = [parsers.MultiPartParser, parsers.JSONParser]

    def get_object(self):
        return get_user_tenant(self.request.user)

    def perform_update(self, serializer):
        clear_logo = self.request.data.get("clear_logo") in ("true", "1", True, "True")
        if clear_logo:
            serializer.save(logo=None)
        else:
            serializer.save()


class TenantMembershipViewSet(generics.ListCreateAPIView, viewsets.GenericViewSet):
    """ViewSet to list and create tenant memberships."""
    serializer_class = TenantMembershipSerializer

    def get_queryset(self):
        return TenantMembership.objects.filter(tenant=get_user_tenant(self.request.user))

    def perform_create(self, serializer):
        serializer.save(tenant=get_user_tenant(self.request.user))


class NfseCredentialViewSet(viewsets.ModelViewSet):
    """
    Manage NFS-e gov.br credentials.
    Accepts gov_br_password (plaintext) — encrypts before saving.
    Never returns the encrypted password — only has_password (bool).
    Mirrors NfseCredentialView SSR.
    """
    serializer_class = NfseCredentialSerializer

    def get_queryset(self):
        return NfseCredential.objects.filter(tenant=get_user_tenant(self.request.user))

    def perform_create(self, serializer):
        serializer.save(tenant=get_user_tenant(self.request.user))


class CepLookupView(APIView):
    """
    GET /api/v1/cep/<cep>/ — lookup address by CEP via ViaCEP.
    Mirrors CepLookupView SSR with same rate limit (60/hour per user).
    """
    throttle_classes = [CepLookupThrottle]

    def get(self, request, cep):
        digits = "".join(c for c in cep if c.isdigit())
        if len(digits) != 8:
            return Response({"error": "CEP inválido."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with urlopen(f"https://viacep.com.br/ws/{digits}/json/", timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            return Response(
                {"error": "Não foi possível consultar o CEP."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if data.get("erro"):
            return Response({"error": "CEP não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "address": data.get("logradouro", ""),
            "district": data.get("bairro", ""),
            "city": data.get("localidade", ""),
            "state": data.get("uf", ""),
            "postal_code": data.get("cep", ""),
            "complement": data.get("complemento", ""),
        })
