from django.contrib.auth.models import User
from django.db import models

from cars.models import Car

VEHICLE_COLORS = [
    ("#C2302B", "Red"),
    ("#2F62B8", "Blue"),
    ("#E8792B", "Orange"),
    ("#2F7D4F", "Green"),
    ("#EFEDE6", "White"),
    ("#A5A9B0", "Silver"),
    ("#3A3B40", "Black"),
]


class ServiceRequest(models.Model):
    class ServiceType(models.TextChoices):
        GENERAL = "general", "General service"
        OIL = "oil", "Oil change"
        BRAKES = "brakes", "Brake check"
        BATTERY = "battery", "Battery check or jump-start"
        TYRES = "tyres", "Tyre change or repair"
        AC = "ac", "AC service"
        BREAKDOWN = "breakdown", "Breakdown help"
        OTHER = "other", "Something else"

    class TimeSlot(models.TextChoices):
        MORNING = "morning", "Morning, 9 am to 12 pm"
        AFTERNOON = "afternoon", "Afternoon, 12 to 4 pm"
        EVENING = "evening", "Evening, 4 to 7 pm"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="service_requests")
    service_type = models.CharField(max_length=20, choices=ServiceType.choices)

    vehicle_make_model = models.CharField(max_length=100)
    registration_number = models.CharField(max_length=20)
    body_style = models.ForeignKey(
        Car,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="The closest showroom car, used only for the picture of the customer's car.",
    )
    vehicle_color = models.CharField(max_length=7, choices=VEHICLE_COLORS, blank=True)

    address = models.TextField()
    phone = models.CharField(max_length=20)
    preferred_date = models.DateField()
    time_slot = models.CharField(max_length=20, choices=TimeSlot.choices)
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.reference} {self.get_service_type_display()} for {self.vehicle_make_model}"

    @property
    def reference(self):
        return f"SR-{self.pk:04d}"

    @property
    def can_cancel(self):
        return self.status in (self.Status.PENDING, self.Status.CONFIRMED)

    @property
    def progress_steps(self):
        """The happy path, each step marked done or not, for the status track."""
        path = [self.Status.PENDING, self.Status.CONFIRMED, self.Status.IN_PROGRESS, self.Status.COMPLETED]
        if self.status == self.Status.CANCELLED:
            return []
        reached = path.index(self.status)
        return [
            {"label": status.label, "done": index <= reached, "current": index == reached}
            for index, status in enumerate(path)
        ]
