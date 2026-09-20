import shutil
import tempfile

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse

from cars.models import Car, CustomizationOption


class FeaturedCarTests(TestCase):
    def test_featured_car_is_listed_and_shown_on_home_first(self):
        Car.objects.create(name="Older", brand="Volt Motors")
        featured = Car.objects.create(name="Star", brand="Volt Motors", featured=True)

        self.assertEqual(Car.objects.first(), featured)
        response = self.client.get(reverse("home"))
        self.assertContains(response, "Star")


class SeedDemoCarsCommandTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)

    def test_seeds_real_cars_with_palette_paint_and_all_option_types(self):
        call_command("seed_demo_cars", verbosity=0)

        self.assertEqual(Car.objects.filter(brand="AutoCraft").count(), 5)
        sedan = Car.objects.get(name="Sedan")
        self.assertTrue(sedan.model_file.name.endswith(".glb"))
        self.assertEqual(sedan.paint_mode, Car.PaintMode.PALETTE)
        self.assertTrue(sedan.paint_region)
        self.assertTrue(sedan.featured)
        self.assertTrue(sedan.thumbnail.name.endswith(".png"))
        self.assertTrue(all(car.thumbnail for car in Car.objects.filter(brand="AutoCraft")))
        types = set(sedan.options.values_list("option_type", flat=True))
        self.assertEqual(types, {"paint", "wheels", "exhaust", "decal"})

    def test_wheel_designs_carry_their_own_part_files(self):
        call_command("seed_demo_cars", verbosity=0)

        wheels = Car.objects.get(name="Sedan").options.filter(option_type="wheels")
        with_parts = [w for w in wheels if w.part_file]
        self.assertGreaterEqual(len(with_parts), 2)
        self.assertTrue(any(not w.part_file for w in wheels))

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
