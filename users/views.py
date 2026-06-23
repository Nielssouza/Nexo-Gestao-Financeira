from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.contrib.auth.views import LoginView, LogoutView
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils.decorators import method_decorator
from django.views.generic import CreateView, ListView, View
from django_ratelimit.decorators import ratelimit
from uuid import uuid4

from users.forms import RegisterForm, StyledAuthenticationForm

User = get_user_model()


class SuperuserRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    def test_func(self):
        return self.request.user.is_superuser


class RegisterView(CreateView):
    form_class = RegisterForm
    template_name = "users/register.html"
    success_url = reverse_lazy("users:login")

    def dispatch(self, request, *args, **kwargs):
        if not getattr(settings, "PUBLIC_SIGNUP_ENABLED", False):
            messages.error(request, "Cadastro publico desabilitado no momento.")
            return redirect("users:login")
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        self.object = form.save(commit=False)
        self.object.is_active = False
        self.object.save()
        messages.success(
            self.request,
            "Cadastro enviado com sucesso. Aguarde a validacao do administrador e depois entre com o mesmo e-mail cadastrado.",
        )
        return redirect(self.get_success_url())


@method_decorator(ratelimit(key="ip", rate="10/m", method="POST", block=False), name="dispatch")
class UserLoginView(LoginView):
    template_name = "users/login.html"
    authentication_form = StyledAuthenticationForm
    redirect_authenticated_user = True

    def dispatch(self, request, *args, **kwargs):
        if getattr(request, "limited", False):
            messages.error(request, "Muitas tentativas de login. Aguarde 1 minuto e tente novamente.")
            return self.render_to_response(self.get_context_data(form=self.get_form()))
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        self.request.session["show_post_login_loader"] = True
        return super().form_valid(form)


class PendingUsersView(SuperuserRequiredMixin, ListView):
    template_name = "users/pending_users.html"
    context_object_name = "pending_users"

    def get_queryset(self):
        return User.objects.filter(is_active=False).order_by("date_joined")


class ApproveUserView(SuperuserRequiredMixin, View):
    def post(self, request, pk):
        user = get_object_or_404(User, pk=pk, is_active=False)
        user.is_active = True
        user.save(update_fields=["is_active"])
        messages.success(request, f"Acesso liberado para {user.email or user.username}.")
        return redirect("users:pending")


class UserLogoutView(LogoutView):
    def get_success_url(self):
        return f"{reverse('users:login')}?logged_out={uuid4().hex}"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        response["Cache-Control"] = "max-age=0, no-cache, no-store, must-revalidate, private"
        response["Clear-Site-Data"] = '"cache"'
        response.delete_cookie(
            settings.CSRF_COOKIE_NAME,
            path=settings.CSRF_COOKIE_PATH,
            domain=settings.CSRF_COOKIE_DOMAIN,
            samesite=settings.CSRF_COOKIE_SAMESITE,
        )
        response.delete_cookie(
            settings.SESSION_COOKIE_NAME,
            path=settings.SESSION_COOKIE_PATH,
            domain=settings.SESSION_COOKIE_DOMAIN,
            samesite=settings.SESSION_COOKIE_SAMESITE,
        )
        return response
