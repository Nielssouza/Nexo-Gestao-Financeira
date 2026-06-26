from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from common.api_mixins import get_user_tenant
from common.throttles import LoginThrottle
from users.serializers import RegisterSerializer, UserSerializer

User = get_user_model()


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class RateLimitedTokenObtainPairView(TokenObtainPairView):
    """
    JWT login com rate limit de 10 tentativas/minuto por IP.
    Espelho de UserLoginView SSR com @ratelimit(key='ip', rate='10/m').
    """
    throttle_classes = [LoginThrottle]


class MeView(APIView):
    """Return the authenticated user's profile and active tenant info."""

    def get(self, request):
        user_data = UserSerializer(request.user).data
        tenant = get_user_tenant(request.user)
        tenant_data = {
            "id": tenant.pk,
            "name": tenant.name,
            "slug": tenant.slug,
        } if tenant else None

        return Response({
            "user": user_data,
            "tenant": tenant_data,
        })


class RegisterAPIView(generics.CreateAPIView):
    """Public registration (mirrors RegisterView SSR — creates user with is_active=False)."""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        if not getattr(settings, "PUBLIC_SIGNUP_ENABLED", False):
            return Response(
                {"detail": "Cadastro público desabilitado no momento."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Cadastro enviado. Aguarde a validação do administrador."},
            status=status.HTTP_201_CREATED,
        )


class PendingUsersView(generics.ListAPIView):
    """
    Lista usuários aguardando aprovação (is_active=False).
    Restrito a superusuários. Espelho de PendingUsersView SSR.
    """
    serializer_class = UserSerializer
    permission_classes = [IsSuperuser]

    def get_queryset(self):
        return User.objects.filter(is_active=False).order_by("date_joined")


class ApproveUserView(APIView):
    """
    POST /api/v1/users/<pk>/approve/ — ativa um usuário pendente.
    Restrito a superusuários. Espelho de ApproveUserView SSR.
    """
    permission_classes = [IsSuperuser]

    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk, is_active=False)
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """
    POST /api/v1/auth/logout/ — invalida o refresh token via blacklist.
    Espelho de UserLogoutView SSR que destroi a sessão.
    Requer: { "refresh": "<refresh_token>" }
    """

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            from rest_framework_simplejwt.tokens import RefreshToken
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            return Response(
                {"detail": "Token inválido ou já expirado."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Logout realizado com sucesso."}, status=status.HTTP_200_OK)
