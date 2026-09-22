from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from cars.models import Car, CustomizationOption
from garage.models import SavedBuild


class CarModelTests(TestCase):
    def test_car_str_includes_brand_and_name(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        self.assertEqual(str(car), "Volt Motors Model S")

    def test_customization_option_linked_to_car(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car,
            option_type=CustomizationOption.OptionType.PAINT,
            label="Racing Red",
            mesh_name="Body",
            color_hex="#CC0000",
        )
        self.assertEqual(option.car, car)
        self.assertIn(option, car.options.all())
        self.assertEqual(option.option_type, "paint")


class RealModelSupportTests(TestCase):
    def test_paint_mode_defaults_to_tint(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")

        self.assertEqual(car.paint_mode, Car.PaintMode.TINT)
        self.assertEqual(car.paint_region, "")

    def test_option_part_file_is_optional(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car, option_type="wheels", label="Stock", mesh_name="wheel-"
        )

        self.assertFalse(option.part_file)

    def test_customizer_passes_paint_settings_and_part_urls_to_the_page(self):
        car = Car.objects.create(
            name="Sedan",
            brand="Kenney",
            paint_mode=Car.PaintMode.PALETTE,
            paint_region="384,128,64,128",
        )
        CustomizationOption.objects.create(
            car=car, option_type="wheels", label="Stock", mesh_name="wheel-"
        )

        response = self.client.get(reverse("car_customizer", args=[car.pk]))

        self.assertContains(response, '"paintMode": "palette"')
        self.assertContains(response, '"paintRegion": "384,128,64,128"')
        self.assertContains(response, '"part_url": null')


class CarGalleryViewTests(TestCase):
    def make_car(self, name, **fields):
        return Car.objects.create(name=name, brand="AutoCraft", model_file=f"cars/models/{name}.glb", **fields)

    def test_gallery_shows_every_car_that_has_a_3d_model(self):
        self.make_car("sedan")
        self.make_car("suv")
        Car.objects.create(name="Placeholder", brand="AutoCraft")

        response = self.client.get(reverse("car_gallery"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual([entry["car"].name for entry in response.context["showroom"]], ["sedan", "suv"])
        self.assertNotContains(response, "Placeholder")

    def test_each_car_links_to_its_customizer(self):
        car = self.make_car("sedan")

        response = self.client.get(reverse("car_gallery"))

        self.assertContains(response, f'href="{reverse("car_customizer", args=[car.pk])}"')

    def test_each_car_shows_its_description(self):
        self.make_car("sedan", description="A balanced everyday four-door.", long_description="Room for the family.")

        response = self.client.get(reverse("car_gallery"))

        self.assertContains(response, "A balanced everyday four-door.")
        self.assertContains(response, "Room for the family.")

    def test_each_car_lists_what_can_be_customized(self):
        car = self.make_car("sedan")
        for label in ["Red", "Blue"]:
            CustomizationOption.objects.create(car=car, option_type="paint", label=label, mesh_name="body", color_hex="#fff")
        CustomizationOption.objects.create(car=car, option_type="wheels", label="Stock", mesh_name="wheel-")
        CustomizationOption.objects.create(car=car, option_type="decal", label="None", mesh_name="body")

        response = self.client.get(reverse("car_gallery"))

        highlights = response.context["showroom"][0]["highlights"]
        self.assertEqual(highlights, ["2 paint colours", "1 wheel design"])

    def test_gallery_passes_3d_model_details_to_the_page(self):
        car = self.make_car("sedan", paint_mode=Car.PaintMode.PALETTE, paint_region="384,128,64,128")

        response = self.client.get(reverse("car_gallery"))

        self.assertContains(response, "showroom-data")
        data = response.context["showroom_data"]
        self.assertEqual(data[0]["id"], car.pk)
        self.assertEqual(data[0]["paintMode"], "palette")
        self.assertTrue(data[0]["modelUrl"].endswith("sedan.glb"))

    def test_gallery_says_so_when_there_are_no_cars(self):
        response = self.client.get(reverse("car_gallery"))

        self.assertContains(response, "No cars yet")

    def test_nav_links_to_the_gallery(self):
        response = self.client.get(reverse("car_gallery"))

        self.assertContains(response, f'href="{reverse("car_gallery")}"')


class CarCustomizerViewTests(TestCase):
    def test_customizer_page_embeds_car_and_options_json(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        CustomizationOption.objects.create(
            car=car,
            option_type=CustomizationOption.OptionType.PAINT,
            label="Racing Red",
            mesh_name="Body",
            color_hex="#CC0000",
        )

        response = self.client.get(reverse("car_customizer", args=[car.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Racing Red")
        self.assertContains(response, "car-data")

    def test_customizer_404s_for_unknown_car(self):
        response = self.client.get(reverse("car_customizer", args=[9999]))
        self.assertEqual(response.status_code, 404)

    def test_customizer_reports_anonymous_users_as_unauthenticated(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")

        response = self.client.get(reverse("car_customizer", args=[car.pk]))

        self.assertContains(response, '"isAuthenticated": false')

    def test_customizer_reports_logged_in_users_as_authenticated(self):
        User.objects.create_user(username="jane", password="pw")
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        self.client.login(username="jane", password="pw")

        response = self.client.get(reverse("car_customizer", args=[car.pk]))

        self.assertContains(response, '"isAuthenticated": true')

    def test_customizer_embeds_selected_options_for_owned_build(self):
        user = User.objects.create_user(username="jane", password="pw")
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )
        build = SavedBuild.objects.create(user=user, car=car, option_ids=str(option.id))
        self.client.login(username="jane", password="pw")

        response = self.client.get(reverse("car_customizer", args=[car.pk]) + f"?build={build.id}")

        self.assertContains(response, "selected-options")

    def test_customizer_ignores_build_owned_by_another_user(self):
        owner = User.objects.create_user(username="jane", password="pw")
        other = User.objects.create_user(username="bob", password="pw")
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )
        build = SavedBuild.objects.create(user=owner, car=car, option_ids=str(option.id))
        self.client.login(username="bob", password="pw")

        response = self.client.get(reverse("car_customizer", args=[car.pk]) + f"?build={build.id}")

        self.assertNotContains(response, "selected-options")


class HomeViewTests(TestCase):
    def test_home_shows_the_first_cars_customizer(self):
        Car.objects.create(name="Model S", brand="Volt Motors")
        Car.objects.create(name="Ranger", brand="Trailblaze")

        response = self.client.get(reverse("home"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Model S")
        self.assertContains(response, "car-data")

    def test_home_falls_back_to_empty_gallery_when_no_cars_exist(self):
        response = self.client.get(reverse("home"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "No cars yet")
