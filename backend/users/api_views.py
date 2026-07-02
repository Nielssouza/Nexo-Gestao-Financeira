from django.conf import settings
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from common.api_mixins import get_user_tenant, is_view_only_superuser
from common.throttles import LoginThrottle
from tenants.models import TenantMembership
from users.serializers import PendingUserSerializer, RegisterSerializer, UserSerializer

User = get_user_model()

_COOKIE_SECURE = not getattr(settings, "DEBUG", False)
_ACCESS_COOKIE = "access_token"
_REFRESH_COOKIE = "refresh_token"


def _set_auth_cookies(response, access: str, refresh: str | None = None):
    response.set_cookie(
        _ACCESS_COOKIE, access,
        httponly=True, secure=_COOKIE_SECURE, samesite="Lax",
        max_age=30 * 60,
    )
    if refresh is not None:
        response.set_cookie(
            _REFRESH_COOKIE, refresh,
            httponly=True, secure=_COOKIE_SECURE, samesite="Lax",
            max_age=7 * 24 * 60 * 60,
        )


def _clear_auth_cookies(response):
    response.delete_cookie(_ACCESS_COOKIE)
    response.delete_cookie(_REFRESH_COOKIE)


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class RateLimitedTokenObtainPairView(TokenObtainPairView):
    """JWT login: rate-limited, sets tokens as httpOnly cookies."""
    throttle_classes = [LoginThrottle]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            _set_auth_cookies(response, response.data["access"], response.data["refresh"])
            response.data = {"detail": "Login realizado com sucesso."}
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Token refresh: reads refresh token from cookie, sets new tokens as cookies."""

    def post(self, request, *args, **kwargs):
        if "refresh" not in request.data:
            refresh = request.COOKIES.get(_REFRESH_COOKIE)
            if refresh:
                data = request.data.copy()
                data["refresh"] = refresh
                request._full_data = data
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            _set_auth_cookies(
                response,
                response.data["access"],
                response.data.get("refresh"),
            )
            response.data = {"detail": "Token renovado."}
        return response


class MeView(APIView):
    """Return the authenticated user's profile and active tenant info."""

    def get(self, request):
        user_data = UserSerializer(request.user).data
        tenant = get_user_tenant(request.user, request)
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
            "created_at": tenant.created_at,
            "role": membership.role if membership else None,
            "is_view_only": is_view_only_superuser(request.user, tenant),
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
    """POST /api/v1/auth/logout/ — blacklists refresh token and clears auth cookies."""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh_token = request.data.get("refresh") or request.COOKIES.get(_REFRESH_COOKIE)
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except Exception:
                pass
        response = Response({"detail": "Logout realizado com sucesso."}, status=status.HTTP_200_OK)
        _clear_auth_cookies(response)
        return response


class SystemStatsView(APIView):
    """GET /api/v1/system/stats/ — estatísticas globais do sistema (superuser only)."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        from tenants.models import Tenant
        return Response({
            "total_users": User.objects.count(),
            "total_tenants": Tenant.objects.count(),
            "total_pf": Tenant.objects.filter(person_type="pf").count(),
            "total_pj": Tenant.objects.filter(person_type="pj").count(),
        })


class SystemTenantsView(APIView):
    """GET /api/v1/system/tenants/ — lista todos os tenants (superuser only)."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        from tenants.models import Tenant
        from django.db.models import Count
        tenants = (
            Tenant.objects
            .annotate(
                user_count=Count('memberships', distinct=True),
                company_count=Count('companies', distinct=True),
            )
            .order_by('created_at')
        )
        return Response([
            {
                "id": t.pk,
                "name": t.name,
                "slug": t.slug,
                "person_type": t.person_type,
                "user_count": t.user_count,
                "company_count": t.company_count,
                "created_at": t.created_at,
                "is_active": t.is_active,
            }
            for t in tenants
        ])


class SystemUsersView(APIView):
    """GET /api/v1/system/users/ — lista todos os usuários com tenant (superuser only)."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        from tenants.models import TenantMembership
        memberships = (
            TenantMembership.objects
            .select_related('user', 'tenant')
            .order_by('user__date_joined')
        )
        return Response([
            {
                "id": m.user.pk,
                "email": m.user.email,
                "first_name": m.user.first_name,
                "last_name": m.user.last_name,
                "username": m.user.username,
                "is_active": m.user.is_active,
                "is_superuser": m.user.is_superuser,
                "date_joined": m.user.date_joined,
                "tenant_id": m.tenant_id,
                "tenant_name": m.tenant.name,
                "tenant_slug": m.tenant.slug,
                "person_type": m.tenant.person_type,
                "role": m.role,
            }
            for m in memberships
        ])


class SystemAllCompaniesView(APIView):
    """GET /api/v1/system/all-companies/ — lista todas as empresas de todos os tenants (superuser only)."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        from tenants.models import TenantCompany
        companies = (
            TenantCompany.objects
            .select_related("tenant")
            .order_by("tenant__created_at", "tenant_id", "sequence_number", "name")
        )
        return Response([
            {
                "id": c.pk,
                "tenant_id": c.tenant_id,
                "tenant_name": c.tenant.name,
                "tenant_code": f"{c.tenant_id:04d}",
                "name": c.name,
                "document": c.document,
                "sequence_number": str(c.sequence_number).zfill(2),
                "is_default": c.is_default,
                "is_active": c.is_active,
            }
            for c in companies
        ])


import os
import re
import subprocess
import tempfile
import shutil
import tarfile
from rest_framework.parsers import MultiPartParser

def get_pg_bin(bin_name):
    # Try finding in PATH first
    path = shutil.which(bin_name)
    if path:
        return path
    # Windows fallback
    if os.name == 'nt':
        import glob
        matches = glob.glob(r'C:\Program Files\PostgreSQL\*\bin\\' + bin_name + '.exe')
        if matches:
            return matches[-1] # Pick the latest version
    return bin_name


def detect_backup_format(file_path: str, original_name: str = "") -> str:
    original_name = (original_name or "").lower()
    if original_name.endswith(".sql"):
        return "sql"
    if original_name.endswith((".dump", ".backup", ".tar")):
        return "archive"

    with open(file_path, "rb") as fh:
        head = fh.read(4096)

    if head.startswith(b"PGDMP"):
        return "archive"

    try:
        if tarfile.is_tarfile(file_path):
            return "archive"
    except tarfile.TarError:
        pass

    if b"\x00" in head:
        return "archive"

    text = head.decode("utf-8", errors="ignore").lstrip("\ufeff").lower()
    sql_markers = (
        "postgresql database dump",
        "set search_path",
        "create table",
        "create schema",
        "insert into",
        "copy ",
        "alter table",
        "begin;",
    )
    if any(marker in text for marker in sql_markers):
        return "sql"

    return "archive"


def append_pgoptions(env: dict[str, str], db_settings: dict) -> None:
    options = db_settings.get("OPTIONS", {})
    pgoptions = options.get("options", "").strip()
    if not pgoptions:
        return
    existing = env.get("PGOPTIONS", "").strip()
    env["PGOPTIONS"] = f"{existing} {pgoptions}".strip() if existing else pgoptions


def summarize_restore_error(result: subprocess.CompletedProcess) -> str:
    combined = "\n".join(
        part.strip()
        for part in (result.stderr or "", result.stdout or "")
        if part and part.strip()
    ).strip()
    if not combined:
        return "Falha sem detalhes retornados pelo PostgreSQL."

    lines = [line.strip() for line in combined.splitlines() if line.strip()]
    priority_lines = [
        line for line in lines
        if any(marker in line.lower() for marker in ("error:", "fatal:", "erro:", "failed:", "could not"))
    ]
    if priority_lines:
        return "\n".join(priority_lines[-8:])[-4000:]
    return "\n".join(lines[-12:])[-4000:]


def get_target_schema(db_settings: dict) -> str:
    env_schema = os.getenv("POSTGRES_SCHEMA", "").strip()
    if env_schema:
        return env_schema

    options = db_settings.get("OPTIONS", {})
    raw_options = options.get("options", "")
    match = re.search(r"search_path\s*=\s*([A-Za-z_][A-Za-z0-9_]*)", raw_options)
    if match:
        return match.group(1)
    return ""


def quote_pg_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def make_temp_restore_schema(target_schema: str) -> str:
    suffix = "__restore_tmp"
    max_identifier_length = 63
    base = target_schema[: max_identifier_length - len(suffix)]
    return f"{base}{suffix}"


def rewrite_restore_sql(sql_text: str, target_schema: str) -> str:
    if not target_schema or target_schema == "public":
        return sql_text

    quoted_target_schema = quote_pg_identifier(target_schema)
    rewritten = sql_text
    rewritten = re.sub(
        r'(?im)^\s*SET\s+search_path\s*=\s*(?:"?public"?)\s*,\s*pg_catalog\s*;\s*$',
        f"SET search_path = {target_schema}, pg_catalog;",
        rewritten,
    )
    rewritten = re.sub(
        r'(?im)^\s*SET\s+search_path\s*=\s*(?:"?public"?)\s*;\s*$',
        f"SET search_path = {target_schema};",
        rewritten,
    )
    rewritten = re.sub(
        r'(?im)^\s*SELECT\s+pg_catalog\.set_config\(\s*\'search_path\'\s*,\s*\'\'\s*,\s*false\s*\)\s*;\s*$',
        f"SELECT pg_catalog.set_config('search_path', '{target_schema}, public', false);",
        rewritten,
    )
    rewritten = re.sub(
        r'(?im)\bSCHEMA\s+(?:"public"|public)(?=\s|;)',
        f"SCHEMA {quoted_target_schema}",
        rewritten,
    )
    rewritten = rewritten.replace('"public".', f'{quoted_target_schema}.')
    rewritten = re.sub(r'(?<![A-Za-z0-9_"])public\.', f'{quoted_target_schema}.', rewritten)
    return rewritten


def prepare_restore_sql(sql_text: str, target_schema: str) -> str:
    rewritten = rewrite_restore_sql(sql_text, target_schema)
    if not target_schema or target_schema == "public":
        return rewritten
    return "CREATE SCHEMA IF NOT EXISTS public;\n" + rewritten


def run_pg_command(command: list[str], env: dict[str, str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        **kwargs,
    )

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
        result = None
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
            append_pgoptions(env, db_settings)

            backup_format = detect_backup_format(tmp_path, file_obj.name)
            psql_bin = get_pg_bin('psql')
            pg_restore_bin = get_pg_bin('pg_restore')
            target_schema = get_target_schema(db_settings)

            if target_schema and target_schema != "public":
                temp_schema = make_temp_restore_schema(target_schema)
                quoted_target_schema = quote_pg_identifier(target_schema)
                quoted_temp_schema = quote_pg_identifier(temp_schema)

                temp_cleanup_cmd = [
                    psql_bin,
                    "-v", "ON_ERROR_STOP=1",
                    "-U", db_user,
                    "-h", db_host,
                    "-p", str(db_port),
                    "-d", db_name,
                    "-c",
                    (
                        "CREATE SCHEMA IF NOT EXISTS public; "
                        f"DROP SCHEMA IF EXISTS {quoted_temp_schema} CASCADE; "
                        f"CREATE SCHEMA {quoted_temp_schema};"
                    ),
                ]
                temp_cleanup_result = run_pg_command(temp_cleanup_cmd, env)
                if temp_cleanup_result.returncode != 0:
                    result = temp_cleanup_result
                else:
                    if backup_format == "sql":
                        with open(tmp_path, "r", encoding="utf-8", errors="replace") as fh:
                            restore_sql = fh.read()
                    else:
                        export_cmd = [
                            pg_restore_bin,
                            "--clean",
                            "--if-exists",
                            "--no-owner",
                            "--no-privileges",
                            "-f", "-",
                            tmp_path,
                        ]
                        export_result = run_pg_command(export_cmd, env)
                        if export_result.returncode != 0:
                            result = export_result
                            restore_sql = ""
                        else:
                            restore_sql = export_result.stdout

                    if temp_cleanup_result.returncode == 0 and (result is None or result.returncode == 0):
                        rewritten_sql = prepare_restore_sql(restore_sql, temp_schema)
                        apply_cmd = [
                            psql_bin,
                            "-v", "ON_ERROR_STOP=1",
                            "-U", db_user,
                            "-h", db_host,
                            "-p", str(db_port),
                            "-d", db_name,
                        ]
                        result = run_pg_command(apply_cmd, env, input=rewritten_sql)

                    if result is not None and result.returncode == 0:
                        finalize_cmd = [
                            psql_bin,
                            "-v", "ON_ERROR_STOP=1",
                            "-U", db_user,
                            "-h", db_host,
                            "-p", str(db_port),
                            "-d", db_name,
                            "-c",
                            (
                                f"DROP SCHEMA IF EXISTS {quoted_target_schema} CASCADE; "
                                f"ALTER SCHEMA {quoted_temp_schema} RENAME TO {quoted_target_schema};"
                            ),
                        ]
                        result = run_pg_command(finalize_cmd, env)

                    if result is not None and result.returncode != 0:
                        drop_temp_cmd = [
                            psql_bin,
                            "-v", "ON_ERROR_STOP=1",
                            "-U", db_user,
                            "-h", db_host,
                            "-p", str(db_port),
                            "-d", db_name,
                            "-c", f"DROP SCHEMA IF EXISTS {quoted_temp_schema} CASCADE;",
                        ]
                        run_pg_command(drop_temp_cmd, env)
            elif backup_format == "sql":
                cmd = [
                    psql_bin,
                    "-v", "ON_ERROR_STOP=1",
                    "-U", db_user,
                    "-h", db_host,
                    "-p", str(db_port),
                    "-d", db_name,
                    "-f", tmp_path
                ]
                result = run_pg_command(cmd, env)
            else:
                cmd = [
                    pg_restore_bin,
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
                result = run_pg_command(cmd, env)

            if result is not None and result.returncode == 0:
                return Response({"detail": "Backup restaurado com sucesso!"}, status=status.HTTP_200_OK)
            else:
                error_output = summarize_restore_error(result) if result is not None else "Falha sem retorno do processo de restore."
                return Response(
                    {
                        "detail": "Erro ao restaurar backup. Verifique se o arquivo e um dump valido do PostgreSQL.",
                        "error": error_output,
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
                return Response(
                    {"detail": "Erro ao restaurar backup. Verifique se o arquivo é um dump válido do pg_dump."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
                
        except Exception as e:
            return Response({"detail": f"Erro interno: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except:
                    pass

class SystemTenantDetailView(APIView):
    """PATCH/DELETE /api/v1/system/tenants/<id>/ - gerencia um tenant específico."""
    permission_classes = [IsSuperuser]

    def patch(self, request, pk):
        from tenants.models import Tenant
        tenant = get_object_or_404(Tenant, pk=pk)
        is_active = request.data.get('is_active')
        if is_active is not None:
            tenant.is_active = is_active
            tenant.save(update_fields=['is_active'])
        return Response({'id': tenant.id, 'is_active': tenant.is_active})

    def delete(self, request, pk):
        from tenants.models import Tenant
        from django.contrib.auth import get_user_model
        
        tenant = get_object_or_404(Tenant, pk=pk)
        tenant.delete()
        
        # Limpa os usuários que ficaram sem nenhum tenant após a exclusão
        User = get_user_model()
        orphaned_users = User.objects.filter(
            tenant_memberships__isnull=True,
            is_superuser=False,
            is_staff=False
        )
        orphaned_users.delete()
        
        return Response(status=status.HTTP_204_NO_CONTENT)


class SystemCompanyDetailView(APIView):
    """PATCH/DELETE /api/v1/system/companies/<id>/ - gerencia uma empresa específica."""
    permission_classes = [IsSuperuser]

    def patch(self, request, pk):
        from tenants.models import TenantCompany
        company = get_object_or_404(TenantCompany, pk=pk)
        is_active = request.data.get('is_active')
        if is_active is not None:
            company.is_active = is_active
            company.save(update_fields=['is_active'])
        return Response({'id': company.id, 'is_active': company.is_active})

    def delete(self, request, pk):
        from tenants.models import TenantCompany
        company = get_object_or_404(TenantCompany, pk=pk)
        company.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SystemUserDetailView(APIView):
    """PATCH/DELETE /api/v1/system/users/<id>/ - gerencia um usuário específico."""
    permission_classes = [IsSuperuser]

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.is_superuser:
            return Response({'detail': 'Não é possível inativar superusuários.'}, status=status.HTTP_400_BAD_REQUEST)
        is_active = request.data.get('is_active')
        if is_active is not None:
            user.is_active = is_active
            user.save(update_fields=['is_active'])
        return Response({'id': user.id, 'is_active': user.is_active})

    def delete(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.is_superuser:
            return Response({'detail': 'Não é possível excluir superusuários.'}, status=status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
