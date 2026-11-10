from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role

ALL_ROLES = {r.value for r in Role}
MANAGERS = {Role.OWNER, Role.ADMIN}
FINANCE = {Role.OWNER, Role.ADMIN, Role.ACCOUNTS}
SALES_TEAM = {Role.OWNER, Role.ADMIN, Role.ACCOUNTS, Role.SALES}
SITE_TEAM = {Role.OWNER, Role.ADMIN, Role.ENGINEER, Role.PURCHASE}
BUYING = {Role.OWNER, Role.ADMIN, Role.ACCOUNTS, Role.PURCHASE}


class RolePermission(BasePermission):
    """Views declare ``read_roles`` and ``write_roles``.

    Reads default to every signed-in user; writes default to owner/admin only,
    so a view that forgets to declare roles fails closed.
    ``action_roles`` can override per custom action.
    """

    message = "Your role does not allow this action."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        action_roles = getattr(view, "action_roles", {})
        action = getattr(view, "action", None)
        if action in action_roles:
            return user.role in action_roles[action]
        if request.method in SAFE_METHODS:
            return user.role in getattr(view, "read_roles", ALL_ROLES)
        return user.role in getattr(view, "write_roles", MANAGERS)
