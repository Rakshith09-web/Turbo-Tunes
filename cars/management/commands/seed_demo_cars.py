from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand

from cars.models import Car, CustomizationOption

ASSETS = Path(__file__).resolve().parents[2] / "seed_assets"

# These are realistic scanned/modeled cars (see cars/seed_assets/README.md for sourcing and
# licensing of each). Unlike the old Kenney set, each model colours itself with its own baked
# materials, so "paint" directly tints one named mesh instead of recoloring a shared palette
# image — paint_mesh (and wheel_mesh) are exact mesh names inside the .glb, found by trial
# rendering: paint a candidate mesh a bright colour, screenshot, check what actually turned
# that colour. wheel_mesh is None where the model has no separate wheel geometry at all.
#
# spoilers: the styles offered on a car (None = no spoiler options at all). Each is (label,
# mesh_name): "generated:<style>" ones are built in code on the car's real trunk lid or roof (see
# static/cars/js/spoilers.js); anything else is the exact mesh name(s) of the car's OWN spoiler
# part, offered as the "stock" choice. A finish (body match / gloss black / carbon) is picked
# separately, from SPOILER_FINISHES.
CARS = [
    {"name": "Sedan", "thumb": "sedan.png", "file": "sedan.glb", "featured": True,
     "paint_mesh": "bPaint_Geo_lodA_Paint_Geo_lodA_BMW_M5SedanRewardRecycled_2024Paint_Material_bBMW_M5SedanRewardRecycled_2024Paint_Material1_0",
     # The source model welds the tire and rim into one shell sharing one material, so recolouring
     # that mesh turned the whole wheel. BMW_WheelRim_1 is the rim split out of it (by distance
     # from each wheel's axis) so only the rim changes; the tire, disc and caliper keep their look.
     "wheel_mesh": "BMW_WheelRim_1",
     # The real BMW M5 has no spoiler, and neither does this model: every style is generated.
     # Shapes follow real parts for the G90 M5 (CS-style lip, M Performance spoiler, CSL ducktail).
     "spoilers": [("None", "generated:none"), ("CS Trunk Lip", "generated:cs_lip"),
                  ("M Performance", "generated:m_perf"), ("CSL Ducktail", "generated:csl_ducktail"),
                  ("Track Wing", "generated:gt_wing")],
     "description": "A balanced everyday four-door.",
     "long_description": "Four doors, a proper boot and a calm, upright shape. It is the easy everyday pick, and a clean canvas for paint."},
    {"name": "Sports Sedan", "thumb": "sports-sedan.png", "file": "sedan-sports.glb",
     "paint_mesh": "porschePaint_Geo_lodA_Paint_Geo_lodA_Porsche_TaycanTurboGTReward_2025Paint_Material_porschePorsche_TaycanTurboGTReward_2025Paint_Material1_0",
     # Same story as the BMW: tire and rim were one welded shell, so the four Porsche_WheelRim_*
     # nodes are the rims split out of the four wheel meshes.
     "wheel_mesh": "Porsche_WheelRim_1,Porsche_WheelRim_2,Porsche_WheelRim_3,Porsche_WheelRim_4",
     # The model's big fixed wing was split out of the body into Porsche_Wing_1..3 (its blade,
     # pylons and details) so it can be swapped; it's the "Stock Wing" choice. The rest follow
     # real Taycan aftermarket parts (decklid spoiler, duckbill, ducktail).
     "spoilers": [("None", "generated:none"),
                  ("Stock Wing", "Porsche_Wing_1,Porsche_Wing_2,Porsche_Wing_3"),
                  ("Decklid Spoiler", "generated:decklid"), ("Duckbill", "generated:duckbill"),
                  ("Ducktail", "generated:ducktail")],
     "description": "A sportier sedan-coupe with serious performance.",
     "long_description": "Low, wide and built for speed, with a fixed rear wing. Add a bold colour and a set of exhaust tips and it is ready for the weekend."},
    {"name": "SUV", "thumb": "suv.png", "file": "suv.glb",
     "paint_mesh": "fender-front-arch-right_body_0",
     # The rims shared one mesh with the brake calipers/discs; SUV_WheelRim_1 is the four rim
     # shells split out of it, so wheel colour no longer tints the brakes.
     "wheel_mesh": "SUV_WheelRim_1",
     "spoilers": None,
     "exhaust": False,
     "description": "Tall, roomy and ready for anything.",
     "long_description": "A tall, rugged body built for comfort over rough roads. Try a deep green or graphite finish."},
    {"name": "Sports Hatchback", "thumb": "sports-hatchback.png", "file": "hatchback-sports.glb",
     "paint_mesh": "A45SK_Hood_101_SK_Hood_101_MI_1236020001_004_A45MI_1236020001_002_0",
     "wheel_mesh": "A45Ani_Wheel_BR112_A45MI_ChangeA_Rim1_0",
     # A real, separate roof-spoiler part — reprocessed to keep it out of the join step that
     # otherwise merges it into the main body mesh (see README's processing notes). Two
     # primitives: the visible wing panel and a thin trim/mount edge around it.
     "spoilers": [
         ("None", "generated:none"),
         ("Stock Roof Spoiler", (
             "A45SK_Spoiler_101_SK_Spoiler_101_MI_Exhaust_006_A45MI_Exhaust1_0,"
             "A45SK_Spoiler_101_SK_Spoiler_101_MI_Exhaust_007_A45MI_1236020001_002_0"
         )),
         ("Aero Cap", "generated:aero_cap"), ("Double Deck Wing", "generated:double_deck"),
         ("Smooth Roof Lip", "generated:roof_lip"),
     ],
     "description": "A compact hot hatch.",
     "long_description": "Compact and easy to park, with sporty lines and a roof spoiler. It is the playful one in the lineup, and bright paint suits it well."},
    {"name": "Future Racer", "thumb": "future-racer.png", "file": "race-future.glb",
     "paint_mesh": "Object_4",
     # No wheel_mesh: this model has no separate wheel geometry at all, even in the raw
     # unprocessed download — it's one fused surface, so there's nothing to target separately.
     "wheel_mesh": None,
     # Already has its own built-in rear wing as part of the model — a generated one on top
     # would look redundant.
     "spoilers": None,
     "decal_flanks": False,
     "description": "A low, wide open-wheel track machine.",
     "long_description": "An open-wheel racer built for the track, with wings at both ends. It is the most dramatic car here: pick a loud colour and fit a titanium tailpipe."},
]

PAINTS = [
    ("Racing Red", "#C2302B"),
    ("Ocean Blue", "#2F62B8"),
    ("Sunset Orange", "#E8792B"),
    ("Forest Green", "#2F7D4F"),
    ("Pearl White", "#EFEDE6"),
    ("Graphite", "#3A3B40"),
    ("Midnight Black", "#0D0E10"),
    ("Speed Yellow", "#F5B800"),
    ("Ultra Violet", "#522258"),
    ("Miami Blue", "#00A3E0"),
    ("Nardo Grey", "#848789"),
    ("Lime Green", "#76B900"),
]

# Real wheel finishes rather than body-paint colours.
WHEEL_COLORS = [
    ("Gloss Black", "#17181A"),
    ("Gunmetal", "#4A4E52"),
    ("Silver", "#B8BCC0"),
    ("Bronze", "#8C6239"),
    ("Gold", "#C4A24E"),
    ("Candy Red", "#A8202B"),
    ("Satin White", "#E6E6E1"),
]

# Rim designs are built in code (static/cars/js/rims.js) and fitted to each car's own wheels; "Stock"
# keeps the model's own rims. Only cars with a separate rim mesh get them (not the Future Racer).
RIM_STYLES = [
    ("Stock", "rims:stock"),
    ("Multi-Spoke", "rims:multispoke"),
    ("Turbine", "rims:turbine"),
    ("Mesh", "rims:mesh"),
    ("Hex Pocket", "rims:hex"),
]

# "generated:" options are built in code (see viewer.js buildExhaust): the tips are placed where
# each car's own bumper has (or would have) its exhaust and finished in chrome, black or titanium.
# "Stock" adds nothing, so the model's own tips (the sedan and hatchback have them baked in) show.
# The SUV gets no exhaust options at all - its spec has "exhaust": False.
EXHAUSTS = [
    ("Stock", "generated:none"),
    ("Chrome Tips", "generated:chrome"),
    ("Black Tips", "generated:black"),
    ("Burnt Titanium", "generated:titanium"),
]

# Decals are projected onto the car's own paint mesh (see viewer.js's applyDecal): from above onto the
# hood, roof and boot, and sideways onto the doors and fenders. They are the five liveries the project
# owner chose (redrawn by cars/seed_assets/make_decals.py into textures/decals/nfs/<slug>_*.png) and
# every car offers the same five, plus "None" to take a decal off. Nothing else is kept: the older
# per-car designs and the plain racing stripes are gone, and re-seeding removes any left in a database.
# The Future Racer only gets the top artwork, because its flanks are open wheels and tyres.
DECAL_DIR = ASSETS / "textures" / "decals" / "nfs"
DECALS = [
    ("Most Wanted", "most_wanted"),
    ("Green Machine", "logy_green"),
    ("Hatch 28", "gti_28"),
    ("Heat RSR", "heat_rsr"),
    ("Flame Run", "flame_run"),
]

SPOILER_FINISHES = [
    ("Body Match", "finish:body", "#8A9099"),  # follows whatever paint the car currently has
    ("Gloss Black", "finish:gloss", "#17181A"),
    ("Carbon Fibre", "finish:carbon", "#2B2E33"),
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
            # Wheels/spoiler only get seeded when the car actually supports them — drop any
            # left over from an older seeding so a car without one doesn't show a broken tab.
            if not spec["wheel_mesh"]:
                car.options.filter(option_type__in=["wheels", "rims"]).delete()
            if not spec["spoilers"]:
                car.options.filter(option_type__in=["spoiler", "spoiler_finish"]).delete()
            if not spec.get("exhaust", True):
                car.options.filter(option_type="exhaust").delete()
            self.seed_options(car, spec["paint_mesh"], spec["wheel_mesh"], spec["spoilers"], spec.get("decal_flanks", True),
                              spec.get("exhaust", True))
            if options["verbosity"]:
                self.stdout.write(f"Seeded {car}")

    def seed_options(self, car, paint_mesh, wheel_mesh, spoilers, decal_flanks, exhaust):
        # Every paint swatch targets the same mesh, at a different colour.
        for label, hex_value in PAINTS:
            self.option(car, "paint", label, paint_mesh, color_hex=hex_value)
        car.options.filter(option_type="paint").exclude(label__in=[l for l, _ in PAINTS]).delete()

        if wheel_mesh:
            for label, hex_value in WHEEL_COLORS:
                self.option(car, "wheels", label, wheel_mesh, color_hex=hex_value)
            for label, mesh_name in RIM_STYLES:
                self.option(car, "rims", label, mesh_name, color_hex="")
            keep_rims = [label for label, _ in RIM_STYLES]
            car.options.filter(option_type="rims").exclude(label__in=keep_rims).delete()

        if exhaust:
            for label, mesh_name in EXHAUSTS:
                self.option(car, "exhaust", label, mesh_name)
            # Drop the old loose-tube options ("Single Tip", "Dual Tips") from earlier seedings.
            car.options.filter(option_type="exhaust").exclude(label__in=[l for l, _ in EXHAUSTS]).delete()

        designs = [("None", None, None, None)]
        for label, slug in DECALS:
            side = DECAL_DIR / f"{slug}_side.png" if decal_flanks else None
            flip = DECAL_DIR / f"{slug}_side_flip.png" if decal_flanks else None
            designs.append((label, DECAL_DIR / f"{slug}_top.png", side, flip))
        for label, top, side, flip in designs:
            decal = self.option(car, "decal", label, paint_mesh)
            for field, path in (("texture_file", top), ("side_texture_file", side),
                                ("side_texture_flipped_file", flip)):
                file_field = getattr(decal, field)
                if path:
                    attach(file_field, path)
                elif file_field:
                    file_field.delete(save=False)
            decal.save()
        # Drop decals from older seedings that are no longer in the lineup.
        keep = [label for label, *_ in designs]
        car.options.filter(option_type="decal").exclude(label__in=keep).delete()

        if spoilers:
            for label, mesh_name in spoilers:
                self.option(car, "spoiler", label, mesh_name, color_hex="")
            for label, mesh_name, hex_value in SPOILER_FINISHES:
                self.option(car, "spoiler_finish", label, mesh_name, color_hex=hex_value)
            # Drop styles and finishes from older seedings (e.g. the old single generated wing).
            keep_styles = [label for label, _ in spoilers]
            car.options.filter(option_type="spoiler").exclude(label__in=keep_styles).delete()
            keep_finishes = [label for label, *_ in SPOILER_FINISHES]
            car.options.filter(option_type="spoiler_finish").exclude(label__in=keep_finishes).delete()

    def option(self, car, option_type, label, mesh_name, **fields):
        option, _ = CustomizationOption.objects.update_or_create(
            car=car,
            option_type=option_type,
            label=label,
            defaults={"mesh_name": mesh_name, **fields},
        )
        return option
