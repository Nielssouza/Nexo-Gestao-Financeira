from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.api_mixins import TenantQuerySetMixin, get_user_tenant
from tenants.models import TenantMembership
from todos.models import Project, TodoItem
from todos.serializers import ProjectSerializer, TodoItemSerializer


class TenantMembersView(APIView):
    """Lightweight list of users in the current tenant for task assignment."""

    def get(self, request):
        tenant = get_user_tenant(request.user, request)
        memberships = (
            TenantMembership.objects
            .filter(tenant=tenant)
            .select_related("user")
            .order_by("user__first_name", "user__email")
        )
        data = []
        for m in memberships:
            u = m.user
            name = u.get_full_name().strip() or u.email or u.username
            data.append({"id": u.id, "name": name, "email": u.email})
        return Response(data)


class ProjectViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    filterset_fields = ("is_finished",)
    search_fields = ("name",)
    ordering_fields = ("name", "created_at")
    ordering = ("name",)
    pagination_class = None



class TodoItemViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = TodoItem.objects.select_related("assigned_to")
    serializer_class = TodoItemSerializer
    filterset_fields = ("is_done", "priority", "status", "project", "assigned_to")
    search_fields = ("title", "description")
    ordering_fields = ("created_at", "due_date", "priority", "title")
    ordering = ("is_done", "-created_at")
    pagination_class = None

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        item = self.get_object()
        item.toggle()
        item.save(update_fields=["is_done", "done_at", "updated_at"])
        return Response(TodoItemSerializer(item).data, status=status.HTTP_200_OK)
