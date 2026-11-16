from django.contrib import admin

from bookings.models import ServiceRequest


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "service_type",
        "vehicle_make_model",
        "registration_number",
        "user",
        "preferred_date",
        "time_slot",
        "status",
    )
    list_filter = ("status", "service_type", "time_slot", "preferred_date")
    search_fields = ("registration_number", "vehicle_make_model", "user__username", "phone", "address")
    date_hierarchy = "preferred_date"
    list_editable = ("status",)
    readonly_fields = ("created_at", "updated_at")
    actions = ["mark_confirmed", "mark_in_progress", "mark_completed"]

    @admin.action(description="Mark selected requests as confirmed")
    def mark_confirmed(self, request, queryset):
        queryset.update(status=ServiceRequest.Status.CONFIRMED)

    @admin.action(description="Mark selected requests as in progress")
    def mark_in_progress(self, request, queryset):
        queryset.update(status=ServiceRequest.Status.IN_PROGRESS)

    @admin.action(description="Mark selected requests as completed")
    def mark_completed(self, request, queryset):
        queryset.update(status=ServiceRequest.Status.COMPLETED)
