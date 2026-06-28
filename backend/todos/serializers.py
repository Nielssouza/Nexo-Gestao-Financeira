from rest_framework import serializers

from todos.models import TodoItem


class TodoItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TodoItem
        fields = (
            "id", "title", "description", "is_done", "status",
            "priority", "due_date", "done_at",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "done_at", "created_at", "updated_at")
