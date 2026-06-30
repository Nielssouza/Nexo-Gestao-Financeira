from rest_framework import serializers

from common.api_mixins import get_user_tenant
from todos.models import Project, TodoItem


class ProjectSerializer(serializers.ModelSerializer):
    todo_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ("id", "name", "description", "color", "is_finished", "finished_at", "todo_count", "created_at", "updated_at")
        read_only_fields = ("id", "todo_count", "created_at", "updated_at", "finished_at")

    def get_todo_count(self, obj):
        return obj.todos.filter(parent__isnull=True, status__in=["pending", "in_progress"]).count()


class TodoItemSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    subtasks = serializers.SerializerMethodField()
    subtask_count = serializers.SerializerMethodField()
    completed_subtask_count = serializers.SerializerMethodField()

    class Meta:
        model = TodoItem
        fields = (
            "id", "title", "description", "is_done", "status",
            "priority", "due_date", "done_at", "project", "parent",
            "assigned_to", "assigned_to_name",
            "subtasks", "subtask_count", "completed_subtask_count",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id",
            "done_at",
            "assigned_to_name",
            "subtasks",
            "subtask_count",
            "completed_subtask_count",
            "created_at",
            "updated_at",
        )

    def get_assigned_to_name(self, obj):
        if not obj.assigned_to_id:
            return None
        u = obj.assigned_to
        return u.get_full_name().strip() or u.email or u.username

    def get_subtasks(self, obj):
        children = obj.subtasks.select_related("assigned_to").all()
        return [
            {
                "id": child.id,
                "title": child.title,
                "description": child.description,
                "is_done": child.is_done,
                "status": child.status,
                "priority": child.priority,
                "due_date": child.due_date,
                "done_at": child.done_at,
                "project": child.project_id,
                "parent": child.parent_id,
                "assigned_to": child.assigned_to_id,
                "assigned_to_name": self.get_assigned_to_name(child),
                "created_at": child.created_at,
                "updated_at": child.updated_at,
            }
            for child in children
        ]

    def get_subtask_count(self, obj):
        return obj.subtasks.count()

    def get_completed_subtask_count(self, obj):
        return obj.subtasks.filter(is_done=True).count()

    def validate_parent(self, parent):
        if parent is None:
            return parent
        request = self.context.get("request")
        if request is not None:
            try:
                tenant = get_user_tenant(request.user, request)
                if tenant and parent.tenant_id != tenant.id:
                    raise serializers.ValidationError("A tarefa pai precisa pertencer ao tenant atual.")
            except serializers.ValidationError:
                raise
            except Exception:
                if parent.user_id != request.user.id:
                    raise serializers.ValidationError("A tarefa pai precisa pertencer ao usuario atual.")
        if self.instance and parent.id == self.instance.id:
            raise serializers.ValidationError("Uma tarefa nao pode ser subtarefa dela mesma.")
        if parent.parent_id:
            raise serializers.ValidationError("Subtarefas em mais de um nivel nao sao suportadas.")
        return parent

    def validate(self, attrs):
        parent = attrs.get("parent", self.instance.parent if self.instance else None)
        if parent is not None:
            attrs["project"] = parent.project
        return attrs
