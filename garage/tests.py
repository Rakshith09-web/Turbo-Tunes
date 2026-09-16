import json

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from cars.models import Car, CustomizationOption
from garage.models import SavedBuild


class SavedBuildModelTests(TestCase):
    def test_saved_build_links_user_car_and_options(self):
        user = User.objects.create_user(username="jane", password="pw")
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )

        build = SavedBuild.objects.create(user=user, car=car, option_ids=str(option.id))

        self.assertEqual(build.user, user)
        self.assertEqual(build.car, car)
        self.assertEqual(build.get_option_id_list(), [option.id])


class SaveBuildViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="jane", password="pw")
        self.car = Car.objects.create(name="Model S", brand="Volt Motors")
        self.option = CustomizationOption.objects.create(
            car=self.car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )

    def test_anonymous_user_cannot_save_a_build(self):
        response = self.client.post(
            reverse("save_build"),
            data=json.dumps({"car_id": self.car.id, "option_ids": [self.option.id]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(SavedBuild.objects.count(), 0)

    def test_logged_in_user_can_save_a_build(self):
        self.client.login(username="jane", password="pw")
        response = self.client.post(
            reverse("save_build"),
            data=json.dumps({"car_id": self.car.id, "option_ids": [self.option.id]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        build = SavedBuild.objects.get()
        self.assertEqual(build.user, self.user)
        self.assertEqual(build.get_option_id_list(), [self.option.id])

    def test_my_garage_lists_only_the_current_users_builds(self):
        other_user = User.objects.create_user(username="bob", password="pw")
        SavedBuild.objects.create(user=self.user, car=self.car, option_ids=str(self.option.id))
        SavedBuild.objects.create(user=other_user, car=self.car, option_ids=str(self.option.id))

        self.client.login(username="jane", password="pw")
        response = self.client.get(reverse("my_garage"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.context["builds"]), 1)

    def test_my_garage_requires_login(self):
        response = self.client.get(reverse("my_garage"))
        self.assertEqual(response.status_code, 302)
