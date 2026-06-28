from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.api_mixins import TenantQuerySetMixin
from todos.models import TodoItem
from todos.serializers import TodoItemSerializer


class TodoItemViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = TodoItem.objects.all()
    serializer_class = TodoItemSerializer
    filterset_fields = ("is_done", "priority", "status")
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
