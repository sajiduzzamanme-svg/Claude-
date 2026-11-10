from rest_framework import serializers

from accounts.models import CostHead

from .models import Estimate, EstimateLine, Flat, Milestone, Project, ProjectDocument
from .services import project_progress


class ProjectSerializer(serializers.ModelSerializer):
    flats_total = serializers.SerializerMethodField()
    flats_sold = serializers.SerializerMethodField()
    documents_pending = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id", "code", "name", "location", "address", "description", "status", "sales_open", "sales_opened_at",
            "land_area_katha", "storeys", "start_date", "expected_handover", "render_url",
            "flats_total", "flats_sold", "documents_pending", "progress", "created_at",
        ]
        read_only_fields = ["sales_open", "sales_opened_at"]

    def get_flats_total(self, obj):
        return len(obj.flats.all())

    def get_flats_sold(self, obj):
        return sum(1 for f in obj.flats.all() if f.status in (Flat.Status.BOOKED, Flat.Status.HANDED_OVER))

    def get_documents_pending(self, obj):
        return sum(1 for d in obj.documents.all() if d.is_required and d.status != ProjectDocument.Status.RECEIVED)

    def get_progress(self, obj):
        return str(project_progress(obj))


class FlatSerializer(serializers.ModelSerializer):
    list_price = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)
    booking = serializers.SerializerMethodField()

    class Meta:
        model = Flat
        fields = [
            "id", "project", "project_code", "code", "floor", "unit", "flat_type", "bedrooms", "size_sqft",
            "land_share_katha", "facing", "land_price", "construction_price", "other_charges", "list_price",
            "status", "booking",
        ]

    def get_booking(self, obj):
        live = getattr(obj, "live_bookings", None)
        if not live:
            return None
        b = live[0]
        return {"id": b.id, "number": b.number, "customer": b.customer.name, "customer_id": b.customer_id}

    def validate(self, attrs):
        manual = (Flat.Status.AVAILABLE, Flat.Status.HOLD)
        if "status" in attrs:
            current = self.instance.status if self.instance else Flat.Status.AVAILABLE
            if attrs["status"] != current and (attrs["status"] not in manual or current not in manual):
                raise serializers.ValidationError(
                    {"status": "Only Available ↔ On hold can be set by hand. Booking and handover set the rest."}
                )
        if self.instance and "project" in attrs and attrs["project"] != self.instance.project:
            raise serializers.ValidationError({"project": "A flat cannot be moved to another project."})
        return attrs


class GenerateFlatsInput(serializers.Serializer):
    floors_from = serializers.IntegerField(min_value=0, max_value=200)
    floors_to = serializers.IntegerField(min_value=0, max_value=200)
    units = serializers.ListField(child=serializers.CharField(max_length=4), allow_empty=False)
    size_sqft = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=1)
    flat_type = serializers.CharField(required=False, allow_blank=True, default="")
    bedrooms = serializers.IntegerField(required=False, default=0, min_value=0)
    facing = serializers.CharField(required=False, allow_blank=True, default="")
    land_share_katha = serializers.DecimalField(max_digits=10, decimal_places=4, required=False, default=0, min_value=0)
    land_price = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    construction_price = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    other_charges = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)


class ProjectDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectDocument
        fields = ["id", "project", "doc_type", "title", "is_required", "status", "reference_no", "received_date", "file", "notes"]


class EstimateLineSerializer(serializers.ModelSerializer):
    cost_head_code = serializers.CharField(source="cost_head.code", read_only=True)
    cost_head_name = serializers.CharField(source="cost_head.name", read_only=True)
    cost_head_name_bn = serializers.CharField(source="cost_head.name_bn", read_only=True)
    category = serializers.CharField(source="cost_head.category", read_only=True)

    class Meta:
        model = EstimateLine
        fields = [
            "id", "cost_head", "cost_head_code", "cost_head_name", "cost_head_name_bn", "category",
            "description", "quantity", "unit", "rate", "amount",
        ]


class EstimateSerializer(serializers.ModelSerializer):
    lines = EstimateLineSerializer(many=True, read_only=True)
    total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    project_code = serializers.CharField(source="project.code", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.display_name", read_only=True, default=None)

    class Meta:
        model = Estimate
        fields = [
            "id", "project", "project_code", "version", "title", "status", "notes", "approved_by_name",
            "approved_at", "total", "lines", "created_at",
        ]
        read_only_fields = ["version", "status", "approved_at"]


class EstimateLineInput(serializers.Serializer):
    cost_head = serializers.PrimaryKeyRelatedField(queryset=CostHead.objects.filter(is_active=True))
    description = serializers.CharField(required=False, allow_blank=True, default="")
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, required=False, default=1, min_value=0)
    unit = serializers.CharField(required=False, allow_blank=True, default="")
    rate = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, default=0, min_value=0)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True, min_value=0)


class EstimateInput(serializers.Serializer):
    project = serializers.PrimaryKeyRelatedField(queryset=Project.objects.all())
    title = serializers.CharField(max_length=120)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    lines = EstimateLineInput(many=True, allow_empty=False)


class MilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Milestone
        fields = ["id", "project", "sequence", "name", "weight", "planned_date", "completed_date", "progress", "notes"]

    def validate(self, attrs):
        progress = attrs.get("progress", self.instance.progress if self.instance else 0)
        if progress == 100 and not attrs.get("completed_date") and not (self.instance and self.instance.completed_date):
            from django.utils import timezone
            attrs["completed_date"] = timezone.localdate()
        if progress < 100 and "progress" in attrs:
            attrs["completed_date"] = None
        return attrs
