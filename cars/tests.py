from django.test import TestCase
from django.urls import reverse
from cars.models import Car, CustomizationOption


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


class CarGalleryViewTests(TestCase):
    def test_gallery_lists_all_cars(self):
        Car.objects.create(name="Model S", brand="Volt Motors")
        Car.objects.create(name="Ranger", brand="Trailblaze")

        response = self.client.get(reverse("car_gallery"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Model S")
        self.assertContains(response, "Ranger")


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
