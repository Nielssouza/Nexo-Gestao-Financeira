from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserChangeForm, UserCreationForm


User = get_user_model()


def email_in_use(email, *, exclude_user_id=None):
    normalized_email = User._default_manager.normalize_email((email or "").strip()).lower()
    if not normalized_email:
        return False

    queryset = User._default_manager.filter(email__iexact=normalized_email)
    if exclude_user_id is not None:
        queryset = queryset.exclude(pk=exclude_user_id)
    return queryset.exists()


class AdminUserCreationForm(UserCreationForm):
    email = forms.EmailField(required=True, label="E-mail")

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "email")

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if email_in_use(email):
            raise forms.ValidationError("Ja existe um cadastro com este e-mail.")
        return email


class AdminUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if email and email_in_use(email, exclude_user_id=self.instance.pk):
            raise forms.ValidationError("Ja existe um cadastro com este e-mail.")
        return email
