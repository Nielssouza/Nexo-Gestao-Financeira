from django.urls import path

from users.views import ApproveUserView, PendingUsersView, RegisterView, UserLoginView, UserLogoutView

app_name = "users"

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", UserLoginView.as_view(), name="login"),
    path("logout/", UserLogoutView.as_view(), name="logout"),
    path("pendentes/", PendingUsersView.as_view(), name="pending"),
    path("pendentes/<int:pk>/aprovar/", ApproveUserView.as_view(), name="approve"),
]
