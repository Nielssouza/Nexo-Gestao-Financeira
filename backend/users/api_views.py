from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from common.api_mixins import get_user_tenant
from common.throttles import LoginThrottle
from tenants.models import TenantMembership
from users.serializers import PendingUserSerializer, RegisterSerializer, UserSerializer

User = get_user_model()


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class RateLimitedTokenObtainPairView(TokenObtainPairView):
    """JWT login with a 10 attempts/minute per-IP rate limit."""
    throttle_classes = [LoginThrottle]


class MeView(APIView):
    """Return the authenticated user's profile and active tenant info."""

    def get(self, request):
        user_data = UserSerializer(request.user).data
        tenant = get_user_tenant(request.user)
        membership = (
            TenantMembership.objects.filter(user=request.user, tenant=tenant).first()
            if tenant else None
        )
        tenant_data = {
            "id": tenant.pk,
            "name": tenant.name,
            "slug": tenant.slug,
            "person_type": tenant.person_type,
            "person_type_display": tenant.get_person_type_display(),
            "role": membership.role if membership else None,
        } if tenant else None

        return Response({
            "user": user_data,
            "tenant": tenant_data,
        })


class RegisterAPIView(generics.CreateAPIView):
    """Public registration. Creates an inactive user pending approval."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        if not getattr(settings, "PUBLIC_SIGNUP_ENABLED", False):
            return Response(
                {"detail": "Cadastro publico desabilitado no momento."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Cadastro enviado. Aguarde a validacao do administrador."},
            status=status.HTTP_201_CREATED,
        )


class PendingUsersView(generics.ListAPIView):
    """List users pending approval. Restricted to superusers."""
    serializer_class = PendingUserSerializer
    permission_classes = [IsSuperuser]

    def get_queryset(self):
        return (
            User.objects.filter(is_active=False)
            .prefetch_related("tenant_memberships__tenant")
            .order_by("date_joined")
        )


class ApproveUserView(APIView):
    """POST /api/v1/users/<pk>/approve/ activates a pending user."""
    permission_classes = [IsSuperuser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk, is_active=False)
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/ invalidates the refresh token through the blacklist.
    Requires: { "refresh": "<refresh_token>" }
    """

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token obrigatorio."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            from rest_framework_simplejwt.tokens import RefreshToken
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            return Response(
                {"detail": "Token invalido ou ja expirado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Logout realizado com sucesso."}, status=status.HTTP_200_OK)

import os
import subprocess
import tempfile
from rest_framework.parsers import MultiPartParser

class RestoreBackupView(APIView):
    """POST /api/v1/system/restore-backup/ uploads a postgres backup file and restores it."""
    permission_classes = [IsSuperuser]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"detail": "Nenhum arquivo enviado."}, status=status.HTTP_400_BAD_REQUEST)

        db_settings = settings.DATABASES['default']
        if 'postgresql' not in db_settings['ENGINE']:
            return Response(
                {"detail": "O sistema atual não está utilizando PostgreSQL."},
                status=status.HTTP_400_BAD_REQUEST
            )

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".backup") as tmp:
                for chunk in file_obj.chunks():
                    tmp.write(chunk)
                tmp_path = tmp.name

            db_name = db_settings['NAME']
            db_user = db_settings['USER']
            db_password = db_settings.get('PASSWORD', '')
            db_host = db_settings.get('HOST', 'localhost')
            db_port = db_settings.get('PORT', '5432')

            env = os.environ.copy()
            if db_password:
                env["PGPASSWORD"] = db_password

            cmd = [
                "pg_restore",
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
                "-U", db_user,
                "-h", db_host,
                "-p", str(db_port),
                "-d", db_name,
                "-1",
                tmp_path
            ]
            
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            if result.returncode != 0 and "input file does not appear to be a valid archive" in result.stderr:
                cmd = [
                    "psql",
                    "-U", db_user,
                    "-h", db_host,
                    "-p", str(db_port),
                    "-d", db_name,
                    "-f", tmp_path
                ]
                result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            
            if result.returncode == 0:
                return Response({"detail": "Backup restaurado com sucesso!"}, status=status.HTTP_200_OK)
            else:
                return Response({
                    "detail": "Erro ao restaurar backup.",
                    "error": result.stderr or result.stdout
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except Exception as e:
            return Response({"detail": f"Erro interno: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
