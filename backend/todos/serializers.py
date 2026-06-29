from rest_framework import serializers

from todos.models import Project, TodoItem


class ProjectSerializer(serializers.ModelSerializer):
    todo_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ("id", "name", "description", "color", "is_finished", "finished_at", "todo_count", "created_at", "updated_at")
        read_only_fields = ("id", "todo_count", "created_at", "updated_at", "finished_at")

    def get_todo_count(self, obj):
        return obj.todos.filter(status__in=["pending", "in_progress"]).count()


class TodoItemSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = TodoItem
        fields = (
            "id", "title", "description", "is_done", "status",
            "priority", "due_date", "done_at", "project",
            "assigned_to", "assigned_to_name",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "done_at", "assigned_to_name", "created_at", "updated_at")

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to_id:
            return None
        u = obj.assigned_to
        return u.get_full_name().strip() or u.email or u.username
