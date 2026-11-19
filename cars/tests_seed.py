import shutil
import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings

from cars.models import Car, CustomizationOption


class FeaturedCarTests(TestCase):
    def test_featured_car_sorts_first(self):
        older = Car.objects.create(name="Older", brand="Volt Motors", model_file="cars/models/older.glb")
        featured = Car.objects.create(
            name="Star", brand="Volt Motors", featured=True, model_file="cars/models/star.glb"
        )

        self.assertEqual(list(Car.objects.all()), [featured, older])

class SeedDemoCarsCommandTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

    def test_seeds_real_cars_with_tint_paint_and_exhaust_options(self):
        call_command("seed_demo_cars", verbosity=0)

        self.assertEqual(Car.objects.filter(brand="AutoCraft").count(), 5)
        sedan = Car.objects.get(name="Sedan")
        self.assertTrue(sedan.model_file.name.endswith(".glb"))
        self.assertEqual(sedan.paint_mode, Car.PaintMode.TINT)
        self.assertFalse(sedan.paint_region)
        self.assertTrue(sedan.featured)
        self.assertTrue(all(car.long_description for car in Car.objects.filter(brand="AutoCraft")))
        self.assertTrue(sedan.thumbnail.name.endswith(".png"))
        self.assertTrue(all(car.thumbnail for car in Car.objects.filter(brand="AutoCraft")))
        types = set(sedan.options.values_list("option_type", flat=True))
        self.assertEqual(types, {"paint", "wheels", "rims", "exhaust", "decal", "spoiler", "spoiler_finish"})
        self.assertNotIn("exhaust", set(Car.objects.get(name="SUV").options.values_list("option_type", flat=True)))

    def test_paint_options_all_target_the_cars_own_paint_mesh(self):
        call_command("seed_demo_cars", verbosity=0)

        sedan = Car.objects.get(name="Sedan")
        mesh_names = set(sedan.options.filter(option_type="paint").values_list("mesh_name", flat=True))
        self.assertEqual(len(mesh_names), 1)
        self.assertTrue(next(iter(mesh_names)))

    def test_wheel_colour_options_have_no_texture_or_part_file(self):
        call_command("seed_demo_cars", verbosity=0)

        wheels = Car.objects.get(name="Sedan").options.filter(option_type="wheels")
        self.assertGreaterEqual(wheels.count(), 7)
        self.assertTrue(all(w.color_hex for w in wheels))
        self.assertTrue(all(not w.part_file for w in wheels))
        self.assertTrue({"Gold", "Candy Red", "Satin White"} <= {w.label for w in wheels})

    def test_cars_with_wheels_get_the_four_rim_designs_and_a_stock_choice(self):
        call_command("seed_demo_cars", verbosity=0)

        for name in ["Sedan", "Sports Sedan", "SUV", "Sports Hatchback"]:
            rims = Car.objects.get(name=name).options.filter(option_type="rims")
            self.assertEqual(
                {o.mesh_name for o in rims},
                {"rims:stock", "rims:multispoke", "rims:turbine", "rims:mesh", "rims:hex"},
                name,
            )
        # no rim mesh on the Future Racer, so no wheels and no rim designs
        self.assertFalse(Car.objects.get(name="Future Racer").options.filter(option_type__in=["wheels", "rims"]).exists())

    def test_every_rim_design_is_defined_in_the_viewer(self):
        from pathlib import Path

        js = (Path(__file__).resolve().parent / "static" / "cars" / "js" / "rims.js").read_text(encoding="utf-8")
        call_command("seed_demo_cars", verbosity=0)
        for option in CustomizationOption.objects.filter(option_type="rims").exclude(mesh_name="rims:stock"):
            key = option.mesh_name.split(":")[1]
            self.assertIn(f"  {key}(R, depth)", js, f"no rim design '{key}' in rims.js")

    def test_every_car_but_the_suv_has_finish_options_for_its_exhaust_tips(self):
        call_command("seed_demo_cars", verbosity=0)

        for car in Car.objects.filter(brand="AutoCraft").exclude(name="SUV"):
            exhaust = car.options.filter(option_type="exhaust")
            self.assertEqual(
                {o.mesh_name for o in exhaust},
                {"generated:none", "generated:chrome", "generated:black", "generated:titanium"},
                car.name,
            )

    def test_suv_has_no_exhaust_options_even_if_an_older_seeding_added_some(self):
        call_command("seed_demo_cars", verbosity=0)
        suv = Car.objects.get(name="SUV")
        CustomizationOption.objects.create(
            car=suv, option_type="exhaust", label="Single Tip", mesh_name="generated:single"
        )

        call_command("seed_demo_cars", verbosity=0)

        self.assertFalse(suv.options.filter(option_type="exhaust").exists())

    def test_old_loose_tube_exhaust_options_are_removed_on_reseed(self):
        call_command("seed_demo_cars", verbosity=0)
        sedan = Car.objects.get(name="Sedan")
        CustomizationOption.objects.create(
            car=sedan, option_type="exhaust", label="Dual Tips", mesh_name="generated:dual"
        )

        call_command("seed_demo_cars", verbosity=0)

        self.assertFalse(sedan.options.filter(option_type="exhaust", label="Dual Tips").exists())

    def test_future_racer_has_no_wheel_options(self):
        call_command("seed_demo_cars", verbosity=0)

        racer = Car.objects.get(name="Future Racer")
        self.assertFalse(racer.options.filter(option_type="wheels").exists())

    def test_decal_options_include_a_real_texture_and_a_none_choice(self):
        call_command("seed_demo_cars", verbosity=0)

        decals = Car.objects.get(name="Sedan").options.filter(option_type="decal")
        self.assertTrue(any(d.texture_file for d in decals))
        self.assertTrue(any(not d.texture_file for d in decals))

    def test_every_car_offers_exactly_the_five_chosen_liveries_plus_none(self):
        call_command("seed_demo_cars", verbosity=0)

        expected = {"None", "Most Wanted", "Green Machine", "Hatch 28", "Heat RSR", "Flame Run"}
        for car in Car.objects.filter(brand="AutoCraft"):
            labels = set(car.options.filter(option_type="decal").values_list("label", flat=True))
            self.assertEqual(labels, expected, car.name)

    def test_old_decals_are_removed_when_reseeding(self):
        call_command("seed_demo_cars", verbosity=0)
        sedan = Car.objects.get(name="Sedan")
        for label in ["Racing Stripes", "Street Claw"]:
            CustomizationOption.objects.create(car=sedan, option_type="decal", label=label, mesh_name="x")

        call_command("seed_demo_cars", verbosity=0)

        labels = set(sedan.options.filter(option_type="decal").values_list("label", flat=True))
        self.assertNotIn("Racing Stripes", labels)
        self.assertNotIn("Street Claw", labels)

    def test_flank_artwork_is_seeded_in_both_directions_except_on_the_open_wheel_racer(self):
        call_command("seed_demo_cars", verbosity=0)

        for name in ["Sedan", "Sports Sedan", "SUV", "Sports Hatchback"]:
            decals = Car.objects.get(name=name).options.filter(option_type="decal").exclude(label="None")
            self.assertEqual(decals.count(), 5, name)
            for decal in decals:
                self.assertTrue(decal.texture_file and decal.side_texture_file and decal.side_texture_flipped_file, f"{name}: {decal.label}")
        racer = Car.objects.get(name="Future Racer").options.filter(option_type="decal").exclude(label="None")
        self.assertEqual(racer.count(), 5)
        self.assertTrue(all(d.texture_file for d in racer))
        self.assertFalse(any(d.side_texture_file for d in racer))

    def test_the_three_road_cars_each_get_four_or_more_spoiler_styles_and_three_finishes(self):
        call_command("seed_demo_cars", verbosity=0)

        for name in ["Sedan", "Sports Sedan", "Sports Hatchback"]:
            car = Car.objects.get(name=name)
            styles = car.options.filter(option_type="spoiler")
            real_styles = styles.exclude(mesh_name="generated:none")
            self.assertGreaterEqual(real_styles.count(), 4, name)
            self.assertTrue(styles.filter(mesh_name="generated:none").exists(), name)  # the None choice
            finishes = car.options.filter(option_type="spoiler_finish")
            self.assertEqual({f.mesh_name for f in finishes}, {"finish:body", "finish:gloss", "finish:carbon"}, name)
            self.assertTrue(all(f.color_hex for f in finishes))

    def test_generated_spoiler_styles_all_have_a_recipe_in_the_viewer(self):
        # the viewer builds "generated:<key>" styles from SPOILER_RECIPES in spoilers.js; a seeded
        # key with no recipe there would be a button that does nothing
        from pathlib import Path

        js = (Path(__file__).resolve().parent / "static" / "cars" / "js" / "spoilers.js").read_text(encoding="utf-8")
        call_command("seed_demo_cars", verbosity=0)
        for option in CustomizationOption.objects.filter(option_type="spoiler", mesh_name__startswith="generated:"):
            key = option.mesh_name.split(":")[1]
            if key == "none":
                continue
            self.assertIn(f"{key}: {{ kind:", js, f"{option.car.name}: no recipe for {key}")

    def test_suv_and_future_racer_have_no_spoiler_options(self):
        call_command("seed_demo_cars", verbosity=0)

        for name in ["SUV", "Future Racer"]:
            car = Car.objects.get(name=name)
            self.assertFalse(car.options.filter(option_type="spoiler").exists())

    def test_cars_with_their_own_spoiler_offer_it_as_the_stock_choice(self):
        call_command("seed_demo_cars", verbosity=0)

        hatch = Car.objects.get(name="Sports Hatchback").options.get(option_type="spoiler", label="Stock Roof Spoiler")
        self.assertFalse(hatch.mesh_name.startswith("generated:"))
        sports_sedan = Car.objects.get(name="Sports Sedan").options.get(option_type="spoiler", label="Stock Wing")
        self.assertEqual(sports_sedan.mesh_name, "Porsche_Wing_1,Porsche_Wing_2,Porsche_Wing_3")
        # the plain sedan has none of its own, so every one of its styles is generated
        sedan = Car.objects.get(name="Sedan").options.filter(option_type="spoiler")
        self.assertTrue(all(o.mesh_name.startswith("generated:") for o in sedan))

    def test_old_single_wing_option_is_removed_on_reseed(self):
        call_command("seed_demo_cars", verbosity=0)
        sedan = Car.objects.get(name="Sedan")
        CustomizationOption.objects.create(
            car=sedan, option_type="spoiler", label="Gloss Black", mesh_name="generated:spoiler", color_hex="#17181A"
        )

        call_command("seed_demo_cars", verbosity=0)

        self.assertFalse(sedan.options.filter(option_type="spoiler", label="Gloss Black").exists())

    def test_reseeding_replaces_a_stale_model_file(self):
        call_command("seed_demo_cars", verbosity=0)
        sedan = Car.objects.get(name="Sedan")
        with open(sedan.model_file.path, "wb") as handle:
            handle.write(b"stale")

        call_command("seed_demo_cars", verbosity=0)

        sedan.refresh_from_db()
        self.assertGreater(sedan.model_file.size, 1000)

    def test_running_twice_keeps_ids_and_does_not_duplicate(self):
        call_command("seed_demo_cars", verbosity=0)
        first_ids = sorted(CustomizationOption.objects.values_list("id", flat=True))
        car_count = Car.objects.count()

        call_command("seed_demo_cars", verbosity=0)

        self.assertEqual(Car.objects.count(), car_count)
        self.assertEqual(sorted(CustomizationOption.objects.values_list("id", flat=True)), first_ids)
