from rest_framework import mixins, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AuditLog, User
from .permissions import MANAGERS, FINANCE
from .serializers import AuditLogSerializer, UserSerializer


class AuditedModelViewSet(viewsets.ModelViewSet):
    """ModelViewSet that stamps ``created_by`` when the model has it."""

    def perform_create(self, serializer):
        model = serializer.Meta.model
        if any(f.name == "created_by" for f in model._meta.fields):
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.order_by("id")
    serializer_class = UserSerializer
    read_roles = MANAGERS | FINANCE
    write_roles = MANAGERS
    search_fields = ["username", "first_name", "last_name", "phone"]
    http_method_names = ["get", "post", "patch", "head", "options"]


class AuditLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditLogSerializer
    read_roles = MANAGERS | FINANCE
    filterset_fields = ["model", "action", "user"]
    search_fields = ["summary", "object_id"]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def staff_directory(request):
    """Minimal id/name list any signed-in user may read (for assignee pickers)."""
    rows = User.objects.filter(is_active=True).order_by("first_name", "username")
    return Response([{"id": u.id, "display_name": u.display_name, "role": u.role} for u in rows])
