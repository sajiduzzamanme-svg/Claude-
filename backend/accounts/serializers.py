from rest_framework import serializers

from projects.models import Project

from .models import Account, CostHead, JournalEntry, JournalLine


class AccountSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = ["id", "code", "name", "name_bn", "type", "is_cash_bank", "is_control", "system_key", "is_active", "balance"]
        read_only_fields = ["is_control", "system_key"]

    def get_balance(self, obj):
        totals = self.context.get("balances", {}).get(obj.id)
        if not totals:
            return "0.00"
        d, c = totals
        return str(d - c if obj.is_debit_normal else c - d)

    def validate(self, attrs):
        if self.instance and self.instance.system_key:
            locked = {"code", "type", "is_cash_bank"} & set(attrs)
            if any(attrs[f] != getattr(self.instance, f) for f in locked):
                raise serializers.ValidationError("System accounts can only be renamed.")
        return attrs


class CostHeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostHead
        fields = ["id", "code", "name", "name_bn", "category", "system_key", "is_active"]
        read_only_fields = ["system_key"]


class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source="account.code", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    account_name_bn = serializers.CharField(source="account.name_bn", read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True, default=None)
    cost_head_name = serializers.CharField(source="cost_head.name", read_only=True, default=None)

    class Meta:
        model = JournalLine
        fields = [
            "id", "account", "account_code", "account_name", "account_name_bn", "project", "project_code",
            "cost_head", "cost_head_name", "debit", "credit", "description",
        ]


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default="")
    total = serializers.SerializerMethodField()
    is_reversed = serializers.SerializerMethodField()
    reverses_number = serializers.CharField(source="reverses.number", read_only=True, default=None)

    class Meta:
        model = JournalEntry
        fields = [
            "id", "number", "date", "memo", "project", "project_code", "source_type", "source_ref", "reverses",
            "reverses_number", "is_reversed", "created_by_name", "created_at", "total", "lines",
        ]

    def get_total(self, obj):
        return str(sum((l.debit for l in obj.lines.all()), 0))

    def get_is_reversed(self, obj):
        return hasattr(obj, "reversed_by")


class ManualLineInput(serializers.Serializer):
    account = serializers.PrimaryKeyRelatedField(queryset=Account.objects.filter(is_active=True))
    debit = serializers.DecimalField(max_digits=18, decimal_places=2, default=0, min_value=0)
    credit = serializers.DecimalField(max_digits=18, decimal_places=2, default=0, min_value=0)
    description = serializers.CharField(required=False, allow_blank=True, default="")


class ManualJournalInput(serializers.Serializer):
    date = serializers.DateField()
    memo = serializers.CharField(max_length=255)
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all(), required=False, allow_null=True)
    lines = ManualLineInput(many=True)

    def validate_lines(self, lines):
        for l in lines:
            if l["account"].is_control:
                raise serializers.ValidationError(
                    f"'{l['account'].name}' is maintained by the system from receipts, bills and payments. "
                    "Use the matching screen instead of a manual journal."
                )
        return lines
