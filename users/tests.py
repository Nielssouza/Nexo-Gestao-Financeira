from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.test.utils import override_settings
from django.urls import reverse

from users.forms import StyledAuthenticationForm


class UserAuthFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user(
            username="auth-user",
            email="auth-user@example.com",
            password="strong-pass-123",
        )

    def test_login_page_disables_cache_and_refreshes_if_restored(self):
        response = self.client.get(reverse("users:login"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response.headers.get("Cache-Control", ""))
        self.assertContains(response, 'window.addEventListener("pageshow"')
        self.assertContains(response, "window.location.reload()")
        self.assertContains(response, 'autocomplete="username"')
        self.assertContains(response, 'autocomplete="current-password"')
        self.assertContains(response, "navigator.credentials.preventSilentAccess")
        self.assertContains(response, 'new URLSearchParams(window.location.search).has("logged_out")')
        self.assertContains(response, "Entre com o e-mail aprovado no seu cadastro.")
        self.assertContains(response, "Cadastros novos ficam pendentes ate validacao do administrador.")

    def test_logout_redirect_disables_cache(self):
        self.client.force_login(self.user)

        response = self.client.post(reverse("users:logout"))

        self.assertEqual(response.status_code, 302)
        redirect_url = response.headers["Location"]
        parsed = urlparse(redirect_url)
        query = parse_qs(parsed.query)

        self.assertEqual(parsed.path, reverse("users:login"))
        self.assertIn("logged_out", query)
        self.assertIn("no-store", response.headers.get("Cache-Control", ""))
        self.assertEqual(response.headers.get("Clear-Site-Data"), '"cache"')
        self.assertIn("sessionid", response.cookies)
        self.assertIn("csrftoken", response.cookies)
        self.assertEqual(response.cookies["sessionid"].value, "")
        self.assertEqual(response.cookies["csrftoken"].value, "")

    def test_user_can_log_in_again_after_logout(self):
        login_url = reverse("users:login")

        first_login = self.client.post(
            login_url,
            {"username": "auth-user@example.com", "password": "strong-pass-123"},
        )
        self.assertRedirects(first_login, reverse("dashboard:home"))

        logout = self.client.post(reverse("users:logout"))
        logout_redirect = urlparse(logout.headers["Location"])
        self.assertEqual(logout.status_code, 302)
        self.assertEqual(logout_redirect.path, login_url)

        second_login = self.client.post(
            login_url,
            {"username": "auth-user@example.com", "password": "strong-pass-123"},
        )
        self.assertRedirects(second_login, reverse("dashboard:home"))

    def test_login_rejects_username_when_email_is_required(self):
        response = self.client.post(
            reverse("users:login"),
            {"username": "auth-user", "password": "strong-pass-123"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFormError(response.context["form"], "username", "Informe um endereço de email válido.")
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_login_throttles_repeated_failed_attempts(self):
        login_url = reverse("users:login")

        for _ in range(5):
            response = self.client.post(
                login_url,
                {"username": "auth-user@example.com", "password": "wrong-pass"},
            )
            self.assertEqual(response.status_code, 200)

        response = self.client.post(
            login_url,
            {"username": "auth-user@example.com", "password": "strong-pass-123"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Muitas tentativas de acesso.")
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_successful_login_clears_previous_failed_attempts(self):
        login_url = reverse("users:login")

        self.client.post(
            login_url,
            {"username": "auth-user@example.com", "password": "wrong-pass"},
        )
        response = self.client.post(
            login_url,
            {"username": "auth-user@example.com", "password": "strong-pass-123"},
        )

        self.assertRedirects(response, reverse("dashboard:home"))
        self.client.logout()

        response = self.client.post(
            login_url,
            {"username": "auth-user@example.com", "password": "strong-pass-123"},
        )

        self.assertRedirects(response, reverse("dashboard:home"))

    def test_auth_form_preserves_mobile_friendly_login_attributes(self):
        form = StyledAuthenticationForm()

        self.assertEqual(form.fields["username"].widget.attrs.get("autocomplete"), "username")
        self.assertEqual(form.fields["username"].widget.attrs.get("autocapitalize"), "none")
        self.assertEqual(form.fields["username"].widget.attrs.get("autocorrect"), "off")
        self.assertEqual(form.fields["username"].widget.attrs.get("inputmode"), "email")
        self.assertEqual(form.fields["password"].widget.attrs.get("autocomplete"), "current-password")
        self.assertEqual(form.fields["password"].widget.attrs.get("autocapitalize"), "none")
        self.assertFalse(form.fields["password"].strip)

    @override_settings(PUBLIC_SIGNUP_ENABLED=True)
    def test_register_creates_inactive_user_and_redirects_to_login(self):
        response = self.client.post(
            reverse("users:register"),
            {
                "email": "pending@example.com",
                "password1": "Strong-pass-123",
                "password2": "Strong-pass-123",
            },
            follow=True,
        )

        created_user = get_user_model().objects.get(email="pending@example.com")

        self.assertFalse(created_user.is_active)
        self.assertEqual(created_user.email, "pending@example.com")
        self.assertTrue(created_user.username)
        self.assertRedirects(response, reverse("users:login"))
        self.assertContains(response, "entre com o mesmo e-mail cadastrado")
        self.assertNotIn("_auth_user_id", self.client.session)

    @override_settings(PUBLIC_SIGNUP_ENABLED=True)
    def test_register_rejects_duplicate_email_case_insensitive(self):
        get_user_model().objects.create_user(
            username="existing-user",
            email="dup@example.com",
            password="Strong-pass-123",
        )

        response = self.client.post(
            reverse("users:register"),
            {
                "email": "DUP@example.com",
                "password1": "Strong-pass-123",
                "password2": "Strong-pass-123",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Ja existe um cadastro com este e-mail.")

    def test_inactive_user_sees_pending_approval_message_on_login(self):
        pending_user = get_user_model().objects.create_user(
            username="inactive-user",
            email="inactive@example.com",
            password="Strong-pass-123",
            is_active=False,
        )

        response = self.client.post(
            reverse("users:login"),
            {"username": pending_user.email, "password": "Strong-pass-123"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response,
            "Seu cadastro foi recebido e aguarda validacao do administrador.",
        )

    def test_admin_action_can_activate_selected_users(self):
        admin_user = get_user_model().objects.create_superuser(
            username="admin-review",
            email="admin-review@example.com",
            password="Strong-pass-123",
        )
        pending_user = get_user_model().objects.create_user(
            username="to-approve",
            email="to-approve@example.com",
            password="Strong-pass-123",
            is_active=False,
        )
        self.client.force_login(admin_user)

        response = self.client.post(
            reverse("admin:auth_user_changelist"),
            {
                "action": "approve_selected_users",
                "_selected_action": [str(pending_user.pk)],
                "index": 0,
            },
            follow=True,
        )

        pending_user.refresh_from_db()

        self.assertTrue(pending_user.is_active)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "cadastro(s) validado(s) e ativado(s)")

    @override_settings(PUBLIC_SIGNUP_ENABLED=True)
    def test_register_page_explains_email_signup_flow(self):
        response = self.client.get(reverse("users:register"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Cadastro individual por e-mail")
        self.assertContains(response, "1 cadastro por e-mail.")
        self.assertContains(response, "Depois da aprovacao, o login e feito com esse mesmo e-mail.")


_SIMPLE_STATIC = {
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
}


@override_settings(STORAGES=_SIMPLE_STATIC)
class PendingUsersViewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.superuser = User.objects.create_superuser(
            username="superadmin",
            email="superadmin@example.com",
            password="Strong-pass-123",
        )
        self.regular_user = User.objects.create_user(
            username="regular",
            email="regular@example.com",
            password="Strong-pass-123",
        )
        self.pending_user = User.objects.create_user(
            username="pending",
            email="pending@example.com",
            password="Strong-pass-123",
            is_active=False,
        )
        self.pending_url = reverse("users:pending")

    def test_anonymous_user_is_redirected_to_login(self):
        response = self.client.get(self.pending_url)

        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("users:login"), response.headers["Location"])

    def test_non_superuser_gets_403(self):
        self.client.force_login(self.regular_user)

        response = self.client.get(self.pending_url)

        self.assertEqual(response.status_code, 403)

    def test_superuser_can_access_pending_list(self):
        self.client.force_login(self.superuser)

        response = self.client.get(self.pending_url)

        self.assertEqual(response.status_code, 200)

    def test_pending_users_are_listed(self):
        self.client.force_login(self.superuser)

        response = self.client.get(self.pending_url)

        self.assertContains(response, self.pending_user.email)

    def test_active_users_are_not_listed(self):
        self.client.force_login(self.superuser)

        response = self.client.get(self.pending_url)

        self.assertNotContains(response, self.regular_user.email)
        self.assertNotContains(response, self.superuser.email)

    def test_empty_state_when_no_pending_users(self):
        self.pending_user.is_active = True
        self.pending_user.save()
        self.client.force_login(self.superuser)

        response = self.client.get(self.pending_url)

        self.assertContains(response, "Nenhum cadastro pendente")


@override_settings(STORAGES=_SIMPLE_STATIC)
class ApproveUserViewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.superuser = User.objects.create_superuser(
            username="superadmin",
            email="superadmin@example.com",
            password="Strong-pass-123",
        )
        self.regular_user = User.objects.create_user(
            username="regular",
            email="regular@example.com",
            password="Strong-pass-123",
        )
        self.pending_user = User.objects.create_user(
            username="pending",
            email="pending@example.com",
            password="Strong-pass-123",
            is_active=False,
        )

    def _approve_url(self, pk):
        return reverse("users:approve", kwargs={"pk": pk})

    def test_anonymous_user_is_redirected_to_login(self):
        response = self.client.post(self._approve_url(self.pending_user.pk))

        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("users:login"), response.headers["Location"])

    def test_non_superuser_gets_403(self):
        self.client.force_login(self.regular_user)

        response = self.client.post(self._approve_url(self.pending_user.pk))

        self.assertEqual(response.status_code, 403)

    def test_superuser_can_approve_pending_user(self):
        self.client.force_login(self.superuser)

        self.client.post(self._approve_url(self.pending_user.pk))

        self.pending_user.refresh_from_db()
        self.assertTrue(self.pending_user.is_active)

    def test_approve_redirects_to_pending_list(self):
        self.client.force_login(self.superuser)

        response = self.client.post(self._approve_url(self.pending_user.pk))

        self.assertRedirects(response, reverse("users:pending"))

    def test_approve_shows_success_message(self):
        self.client.force_login(self.superuser)

        response = self.client.post(self._approve_url(self.pending_user.pk), follow=True)

        self.assertContains(response, "Acesso liberado para")

    def test_approving_already_active_user_returns_404(self):
        self.client.force_login(self.superuser)

        response = self.client.post(self._approve_url(self.regular_user.pk))

        self.assertEqual(response.status_code, 404)

    def test_get_request_is_not_allowed(self):
        self.client.force_login(self.superuser)

        response = self.client.get(self._approve_url(self.pending_user.pk))

        self.assertEqual(response.status_code, 405)
