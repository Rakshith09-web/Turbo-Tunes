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


class AuthPagesTests(TestCase):
    def test_login_page_offers_the_form_and_a_way_to_register(self):
        response = self.client.get(reverse("login"))

        self.assertContains(response, 'name="username"')
        self.assertContains(response, 'name="password"')
        self.assertContains(response, reverse("register"))
        self.assertContains(response, "Welcome back")

    def test_wrong_password_gets_a_friendly_message(self):
        User.objects.create_user(username="jane", password="right-pass-1")

        response = self.client.post(reverse("login"), {"username": "jane", "password": "wrong"})

        self.assertContains(response, "don&#x27;t match")

    def test_login_sends_people_back_to_where_they_were_going(self):
        User.objects.create_user(username="jane", password="right-pass-1")

        response = self.client.post(
            reverse("login") + "?next=/service/book/",
            {"username": "jane", "password": "right-pass-1", "next": "/service/book/"},
        )

        self.assertRedirects(response, "/service/book/", fetch_redirect_response=False)

    def test_register_page_offers_the_form_and_a_way_to_log_in(self):
        response = self.client.get(reverse("register"))

        self.assertContains(response, 'name="password2"')
        self.assertContains(response, "Create your account")
        self.assertContains(response, reverse("login"))

    def test_register_passes_the_destination_on_to_the_login_step(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "sam",
                "password1": "a-strong-pass-1",
                "password2": "a-strong-pass-1",
                "next": "/service/book/",
            },
        )

        self.assertRedirects(
            response, reverse("login") + "?next=%2Fservice%2Fbook%2F", fetch_redirect_response=False
        )

    def test_register_ignores_a_destination_on_another_site(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "sam",
                "password1": "a-strong-pass-1",
                "password2": "a-strong-pass-1",
                "next": "https://evil.example/steal",
            },
        )

        self.assertRedirects(response, reverse("login"), fetch_redirect_response=False)

    def test_register_shows_a_short_password_hint_not_the_long_django_list(self):
        response = self.client.get(reverse("register"))

        self.assertContains(response, "At least 8 characters")
        self.assertNotContains(response, "can’t be entirely numeric")
