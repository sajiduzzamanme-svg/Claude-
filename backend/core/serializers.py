from rest_framework import serializers

from .models import AuditLog, User


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=6)

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "display_name", "email", "phone",
            "designation", "role", "is_active", "password", "last_login",
        ]
        read_only_fields = ["last_login"]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "Password is required for a new user."})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.display_name", read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = ["id", "user", "user_name", "action", "model", "object_id", "summary", "data", "created_at"]
