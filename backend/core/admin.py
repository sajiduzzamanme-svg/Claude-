from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import AuditLog, User


@admin.register(User)
class SpaceUpUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Space Up", {"fields": ("role", "phone", "designation")}),)
    list_display = ("username", "first_name", "last_name", "role", "is_active")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "user", "action", "model", "object_id", "summary")
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
