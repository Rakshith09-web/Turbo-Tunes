from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from accounts.models import Profile


class RegistrationTests(TestCase):
    def test_registration_creates_user_and_profile(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "jane",
                "password1": "a-strong-pass-1",
                "password2": "a-strong-pass-1",
            },
        )

        self.assertEqual(response.status_code, 302)
        user = User.objects.get(username="jane")
        self.assertTrue(Profile.objects.filter(user=user).exists())

    def test_registered_user_can_log_in(self):
        self.client.post(
            reverse("register"),
            {
                "username": "jane",
                "password1": "a-strong-pass-1",
                "password2": "a-strong-pass-1",
            },
        )
        logged_in = self.client.login(username="jane", password="a-strong-pass-1")
        self.assertTrue(logged_in)
