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
        self.assertEqual(types, {"paint", "wheels", "exhaust", "decal", "spoiler"})

    def test_paint_options_all_target_the_cars_own_paint_mesh(self):
        call_command("seed_demo_cars", verbosity=0)

        sedan = Car.objects.get(name="Sedan")
        mesh_names = set(sedan.options.filter(option_type="paint").values_list("mesh_name", flat=True))
        self.assertEqual(len(mesh_names), 1)
        self.assertTrue(next(iter(mesh_names)))

    def test_wheel_colour_options_have_no_texture_or_part_file(self):
        call_command("seed_demo_cars", verbosity=0)

        wheels = Car.objects.get(name="Sedan").options.filter(option_type="wheels")
        self.assertGreaterEqual(wheels.count(), 2)
        self.assertTrue(all(w.color_hex for w in wheels))
        self.assertTrue(all(not w.part_file for w in wheels))

    def test_future_racer_has_no_wheel_options(self):
        call_command("seed_demo_cars", verbosity=0)

        racer = Car.objects.get(name="Future Racer")
        self.assertFalse(racer.options.filter(option_type="wheels").exists())

    def test_decal_options_include_a_real_texture_and_a_none_choice(self):
        call_command("seed_demo_cars", verbosity=0)

        decals = Car.objects.get(name="Sedan").options.filter(option_type="decal")
        self.assertEqual(decals.count(), 2)
        self.assertTrue(any(d.texture_file for d in decals))
        self.assertTrue(any(not d.texture_file for d in decals))

    def test_spoiler_options_are_generated_with_a_none_choice(self):
        call_command("seed_demo_cars", verbosity=0)

        spoilers = Car.objects.get(name="Sedan").options.filter(option_type="spoiler")
        self.assertGreaterEqual(spoilers.count(), 2)
        self.assertTrue(all(s.mesh_name == "generated:spoiler" for s in spoilers))
        self.assertTrue(any(s.color_hex for s in spoilers))
        self.assertTrue(any(not s.color_hex for s in spoilers))

    def test_suv_and_future_racer_have_no_spoiler_options(self):
        call_command("seed_demo_cars", verbosity=0)

        for name in ["SUV", "Future Racer"]:
            car = Car.objects.get(name=name)
            self.assertFalse(car.options.filter(option_type="spoiler").exists())

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
