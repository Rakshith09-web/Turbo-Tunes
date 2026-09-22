from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand

from cars.models import Car, CustomizationOption

ASSETS = Path(__file__).resolve().parents[2] / "seed_assets"

# These are realistic scanned/modeled cars (see cars/seed_assets/README.md for sourcing and
# licensing of each). Unlike the old Kenney set, each model colours itself with its own baked
# materials, so "paint" directly tints one named mesh instead of recoloring a shared palette
# image — paint_mesh is that mesh's exact name inside the .glb, found by trial rendering.
CARS = [
    {"name": "Sedan", "thumb": "sedan.png", "file": "sedan.glb", "featured": True,
     "paint_mesh": "bPaint_Geo_lodA_Paint_Geo_lodA_BMW_M5SedanRewardRecycled_2024Paint_Material_bBMW_M5SedanRewardRecycled_2024Paint_Material1_0",
     "description": "A balanced everyday four-door.",
     "long_description": "Four doors, a proper boot and a calm, upright shape. It is the easy everyday pick, and a clean canvas for paint."},
    {"name": "Sports Sedan", "thumb": "sports-sedan.png", "file": "sedan-sports.glb",
     "paint_mesh": "porschePaint_Geo_lodA_Paint_Geo_lodA_Porsche_TaycanTurboGTReward_2025Paint_Material_porschePorsche_TaycanTurboGTReward_2025Paint_Material1_0",
     "description": "A sportier sedan-coupe with serious performance.",
     "long_description": "Low, wide and built for speed, with a fixed rear wing. Add a bold colour and dual exhaust tips and it is ready for the weekend."},
    {"name": "SUV", "thumb": "suv.png", "file": "suv.glb",
     "paint_mesh": "fender-front-arch-right_body_0",
     "description": "Tall, roomy and ready for anything.",
     "long_description": "A tall, rugged body built for comfort over rough roads. Try a deep green or graphite finish."},
    {"name": "Sports Hatchback", "thumb": "sports-hatchback.png", "file": "hatchback-sports.glb",
     "paint_mesh": "A45SK_Hood_101_SK_Hood_101_MI_1236020001_004_A45MI_1236020001_002_0",
     "description": "A compact hot hatch.",
     "long_description": "Compact and easy to park, with sporty lines and a roof spoiler. It is the playful one in the lineup, and bright paint suits it well."},
    {"name": "Future Racer", "thumb": "future-racer.png", "file": "race-future.glb",
     "paint_mesh": "Object_4",
     "description": "A low, wide open-wheel track machine.",
     "long_description": "An open-wheel racer built for the track, with wings at both ends. It is the most dramatic car here: pick a loud colour and fit dual exhaust tips."},
]

PAINTS = [
    ("Racing Red", "#C2302B"),
    ("Ocean Blue", "#2F62B8"),
    ("Sunset Orange", "#E8792B"),
    ("Forest Green", "#2F7D4F"),
    ("Pearl White", "#EFEDE6"),
    ("Graphite", "#3A3B40"),
]

# "generated:" options are built in code from the car's own bounding box, so they work
# regardless of what the underlying model looks like — these realistic cars have no exhaust
# parts of their own, same as the old Kenney set.
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
    help = "Load the demo cars (realistic scanned models) and their customization options."

    def handle(self, *args, **options):
        for spec in CARS:
            car, _ = Car.objects.get_or_create(
                brand="AutoCraft", name=spec["name"], defaults={"description": spec["description"]}
            )
            car.description = spec["description"]
            car.long_description = spec["long_description"]
            car.paint_mode = Car.PaintMode.TINT
            car.paint_region = ""
            car.featured = spec.get("featured", False)
            attach(car.model_file, ASSETS / "models" / spec["file"])
            attach(car.thumbnail, ASSETS / "thumbnails" / spec["thumb"])
            car.save()
            # Drop any wheels/decal options left over from an older seeding of this car (e.g.
            # the previous Kenney models) — this set of cars doesn't support either.
            car.options.filter(option_type__in=["wheels", "decal"]).delete()
            self.seed_options(car, spec["paint_mesh"])
            if options["verbosity"]:
                self.stdout.write(f"Seeded {car}")

    def seed_options(self, car, paint_mesh):
        # Every paint swatch targets the same mesh, at a different colour.
        for label, hex_value in PAINTS:
            self.option(car, "paint", label, paint_mesh, color_hex=hex_value)

        # Wheel swapping and decals were built for the old Kenney models' consistent part
        # naming; these scanned models don't have matching swappable parts, so those option
        # types are left unseeded here — the customizer only shows the tabs a car actually has.
        for label, mesh_name in EXHAUSTS:
            self.option(car, "exhaust", label, mesh_name)

    def option(self, car, option_type, label, mesh_name, **fields):
        option, _ = CustomizationOption.objects.update_or_create(
            car=car,
            option_type=option_type,
            label=label,
            defaults={"mesh_name": mesh_name, **fields},
        )
        return option
