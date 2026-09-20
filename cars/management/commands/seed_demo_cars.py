from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand

from cars.models import Car, CustomizationOption

ASSETS = Path(__file__).resolve().parents[2] / "seed_assets"

# The Kenney Car Kit (CC0) models colour themselves from one shared palette image.
# paint_region is the x,y,width,height (in texture pixels) of each body's paint swatch.
CARS = [
    {"name": "Sedan", "thumb": "sedan.png", "file": "sedan.glb", "paint_region": "384,128,64,128", "featured": True,
     "description": "A balanced everyday four-door."},
    {"name": "Sports Sedan", "thumb": "sports-sedan.png", "file": "sedan-sports.glb", "paint_region": "384,128,64,128",
     "description": "A sportier sedan with a rear spoiler."},
    {"name": "SUV", "thumb": "suv.png", "file": "suv.glb", "paint_region": "192,128,64,128",
     "description": "Tall, roomy and ready for anything."},
    {"name": "Sports Hatchback", "thumb": "sports-hatchback.png", "file": "hatchback-sports.glb", "paint_region": "192,128,64,128",
     "description": "A compact hot hatch."},
    {"name": "Future Racer", "thumb": "future-racer.png", "file": "race-future.glb", "paint_region": "448,128,64,128",
     "description": "A low, wide track machine."},
]

PAINTS = [
    ("Racing Red", "#C2302B"),
    ("Ocean Blue", "#2F62B8"),
    ("Sunset Orange", "#E8792B"),
    ("Forest Green", "#2F7D4F"),
    ("Pearl White", "#EFEDE6"),
    ("Graphite", "#3A3B40"),
]

# (label, mesh_name, part file). "wheel-" targets the four side wheels; no part file means
# the car's own stock wheels.
WHEELS = [
    ("Stock", "wheel-", None),
    ("Dark Alloy", "wheel-", "wheel-dark.glb"),
    ("Racing", "wheel-", "wheel-racing.glb"),
]

# "generated:" options are built in code, since these models have no exhaust parts.
EXHAUSTS = [
    ("Stock", "generated:none"),
    ("Single Tip", "generated:single"),
    ("Dual Tips", "generated:dual"),
]


def attach(field_file, path):
    if field_file and field_file.storage.exists(field_file.name):
        if field_file.size == path.stat().st_size:
            return
        field_file.delete(save=False)
    with open(path, "rb") as handle:
        field_file.save(path.name, File(handle), save=False)


class Command(BaseCommand):
    help = "Load the demo cars (free CC0 Kenney Car Kit models) and their customization options."

    def handle(self, *args, **options):
        for spec in CARS:
            car, _ = Car.objects.get_or_create(
                brand="AutoCraft", name=spec["name"], defaults={"description": spec["description"]}
            )
            car.description = spec["description"]
            car.paint_mode = Car.PaintMode.PALETTE
            car.paint_region = spec["paint_region"]
            car.featured = spec.get("featured", False)
            attach(car.model_file, ASSETS / "models" / spec["file"])
            attach(car.thumbnail, ASSETS / "thumbnails" / spec["thumb"])
            car.save()
            self.seed_options(car)
            if options["verbosity"]:
                self.stdout.write(f"Seeded {car}")

    def seed_options(self, car):
        for label, hex_value in PAINTS:
            self.option(car, "paint", label, "body", color_hex=hex_value)

        for label, mesh_name, part in WHEELS:
            option = self.option(car, "wheels", label, mesh_name)
            if part:
                attach(option.part_file, ASSETS / "models" / part)
                option.save()

        for label, mesh_name in EXHAUSTS:
            self.option(car, "exhaust", label, mesh_name)

        self.option(car, "decal", "None", "body")
        decal = self.option(car, "decal", "Racing Stripes", "body")
        attach(decal.texture_file, ASSETS / "textures" / "racing_stripes.png")
        decal.save()

    def option(self, car, option_type, label, mesh_name, **fields):
        option, _ = CustomizationOption.objects.update_or_create(
            car=car,
            option_type=option_type,
            label=label,
            defaults={"mesh_name": mesh_name, **fields},
        )
        return option
