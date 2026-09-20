from django.db import models


class Car(models.Model):
    class PaintMode(models.TextChoices):
        TINT = "tint", "Tint the material colour"
        PALETTE = "palette", "Recolor a swatch in the palette texture"

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
    paint_mode = models.CharField(
        max_length=10,
        choices=PaintMode.choices,
        default=PaintMode.TINT,
        help_text="Palette: the model colours itself from one shared palette image, so paint recolors just the body's swatch.",
    )
    paint_region = models.CharField(
        max_length=40,
        blank=True,
        help_text="Palette mode only: x,y,width,height in texture pixels of the body paint swatch, e.g. 384,128,64,128.",
    )

    featured = models.BooleanField(
        default=False, help_text="Featured cars are listed first and shown on the homepage."
    )

    class Meta:
        ordering = ["-featured", "id"]

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
    part_file = models.FileField(
        upload_to="cars/parts/",
        blank=True,
        null=True,
        help_text="Optional extra .glb this option uses, e.g. an alternate wheel design.",
    )

    def __str__(self):
        return f"{self.car} - {self.label}"
