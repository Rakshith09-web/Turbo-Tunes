from django.db import models


class Car(models.Model):
    name = models.CharField(max_length=100)
    brand = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    thumbnail = models.ImageField(upload_to="cars/thumbnails/", blank=True, null=True)
    model_file = models.FileField(
        upload_to="cars/models/",
        blank=True,
        null=True,
        help_text="A .glb file. Leave blank to use the built-in procedural placeholder car.",
    )

    def __str__(self):
        return f"{self.brand} {self.name}"


class CustomizationOption(models.Model):
    class OptionType(models.TextChoices):
        PAINT = "paint", "Paint Colour"
        WHEELS = "wheels", "Wheels"
        DECAL = "decal", "Decal"
        INTERIOR = "interior", "Interior Colour"
        EXHAUST = "exhaust", "Exhaust"

    car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="options")
    option_type = models.CharField(max_length=20, choices=OptionType.choices)
    label = models.CharField(max_length=100)
    mesh_name = models.CharField(
        max_length=100,
        help_text="Exact mesh/object name inside the car's .glb file that this option targets.",
    )
    color_hex = models.CharField(
        max_length=7, blank=True, help_text="Used for paint/interior options, e.g. #CC0000"
    )
    texture_file = models.ImageField(
        upload_to="cars/textures/", blank=True, null=True, help_text="Used for decal options."
    )

    def __str__(self):
        return f"{self.car} - {self.label}"
