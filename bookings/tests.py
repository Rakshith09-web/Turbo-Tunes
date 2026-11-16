from datetime import date, timedelta

from django.contrib.admin.sites import site as admin_site
from django.contrib.auth.models import User
from django.contrib.messages import get_messages
from django.test import TestCase
from django.urls import reverse

from accounts.models import Profile
from bookings.models import ServiceRequest
from cars.models import Car


def valid_payload(car, **overrides):
    payload = {
        "service_type": "oil",
        "vehicle_make_model": "Honda City 2019",
        "registration_number": "ka 01 ab 1234",
        "body_style": car.pk,
        "vehicle_color": "#2F62B8",
        "address": "12 MG Road, near the metro station, Bengaluru",
        "phone": "+91 98765 43210",
        "preferred_date": (date.today() + timedelta(days=2)).isoformat(),
        "time_slot": "morning",
        "notes": "Engine makes a rattling noise on start.",
        "remember_details": "on",
    }
    payload.update(overrides)
    return payload


class BookingTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="jane", password="pw")
        self.other = User.objects.create_user(username="bob", password="pw")
        self.car = Car.objects.create(name="Sedan", brand="AutoCraft", model_file="cars/models/sedan.glb")
        self.client.login(username="jane", password="pw")

    def make_request(self, user=None, **fields):
        data = {
            "user": user or self.user,
            "service_type": "oil",
            "vehicle_make_model": "Honda City",
            "registration_number": "KA01AB1234",
            "body_style": self.car,
            "address": "12 MG Road, Bengaluru",
            "phone": "9876543210",
            "preferred_date": date.today() + timedelta(days=1),
            "time_slot": "morning",
        }
        data.update(fields)
        return ServiceRequest.objects.create(**data)


class ServiceRequestModelTests(BookingTestCase):
    def test_new_requests_start_pending_with_a_readable_reference(self):
        request = self.make_request()

        self.assertEqual(request.status, ServiceRequest.Status.PENDING)
        self.assertEqual(request.reference, f"SR-{request.pk:04d}")

    def test_only_open_requests_can_be_cancelled(self):
        for status, expected in [
            (ServiceRequest.Status.PENDING, True),
            (ServiceRequest.Status.CONFIRMED, True),
            (ServiceRequest.Status.IN_PROGRESS, False),
            (ServiceRequest.Status.COMPLETED, False),
            (ServiceRequest.Status.CANCELLED, False),
        ]:
            self.assertEqual(self.make_request(status=status).can_cancel, expected, status)

    def test_newest_requests_are_listed_first(self):
        first = self.make_request()
        second = self.make_request()

        self.assertEqual(list(ServiceRequest.objects.all()), [second, first])


class BookingAccessTests(BookingTestCase):
    def test_booking_pages_send_anonymous_visitors_to_login_and_come_back(self):
        self.client.logout()

        response = self.client.get(reverse("book_service"))

        self.assertRedirects(response, f"{reverse('login')}?next={reverse('book_service')}")

    def test_request_list_requires_login(self):
        self.client.logout()

        self.assertEqual(self.client.get(reverse("my_requests")).status_code, 302)

    def test_list_shows_only_my_own_requests(self):
        mine = self.make_request(vehicle_make_model="Honda City")
        self.make_request(user=self.other, vehicle_make_model="Secret Sedan")

        response = self.client.get(reverse("my_requests"))

        self.assertContains(response, "Honda City")
        self.assertNotContains(response, "Secret Sedan")
        self.assertEqual(list(response.context["requests"]), [mine])

    def test_detail_shows_the_3d_car_in_the_colour_that_was_booked(self):
        request = self.make_request(vehicle_color="#2F62B8")

        response = self.client.get(reverse("service_detail", args=[request.pk]))

        self.assertContains(response, "car-display-data")
        self.assertEqual(response.context["car_display"]["color"], "#2F62B8")
        self.assertEqual(response.context["car_display"]["style"]["name"], "Sedan")

    def test_detail_still_works_when_the_body_style_was_removed(self):
        request = self.make_request(body_style=None)

        response = self.client.get(reverse("service_detail", args=[request.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "car-display-data")

    def test_detail_is_404_for_someone_elses_request(self):
        theirs = self.make_request(user=self.other)

        response = self.client.get(reverse("service_detail", args=[theirs.pk]))

        self.assertEqual(response.status_code, 404)


class BookingFormTests(BookingTestCase):
    def test_booking_page_offers_only_cars_that_have_a_3d_model(self):
        Car.objects.create(name="Box", brand="AutoCraft")

        response = self.client.get(reverse("book_service"))

        styles = [car.name for car in response.context["form"].fields["body_style"].queryset]
        self.assertEqual(styles, ["Sedan"])
        self.assertContains(response, "car-preview-data")

    def test_valid_request_is_saved_and_shown(self):
        response = self.client.post(reverse("book_service"), valid_payload(self.car))

        request = ServiceRequest.objects.get()
        self.assertRedirects(response, reverse("service_detail", args=[request.pk]))
        self.assertEqual(request.user, self.user)
        self.assertEqual(request.registration_number, "KA 01 AB 1234")
        self.assertEqual(request.status, ServiceRequest.Status.PENDING)
        self.assertEqual(request.body_style, self.car)
        self.assertTrue(any("received" in str(m).lower() for m in get_messages(response.wsgi_request)))

    def test_past_dates_are_rejected(self):
        payload = valid_payload(self.car, preferred_date=(date.today() - timedelta(days=1)).isoformat())

        response = self.client.post(reverse("book_service"), payload)

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "past")
        self.assertEqual(ServiceRequest.objects.count(), 0)

    def test_dates_far_in_the_future_are_rejected(self):
        payload = valid_payload(self.car, preferred_date=(date.today() + timedelta(days=400)).isoformat())

        response = self.client.post(reverse("book_service"), payload)

        self.assertEqual(ServiceRequest.objects.count(), 0)
        self.assertContains(response, "90 days")

    def test_phone_numbers_must_look_like_phone_numbers(self):
        response = self.client.post(reverse("book_service"), valid_payload(self.car, phone="call me"))

        self.assertContains(response, "phone number")
        self.assertEqual(ServiceRequest.objects.count(), 0)

    def test_address_needs_enough_detail_to_find_the_car(self):
        response = self.client.post(reverse("book_service"), valid_payload(self.car, address="home"))

        self.assertContains(response, "address")
        self.assertEqual(ServiceRequest.objects.count(), 0)

    def test_required_fields_are_reported_together(self):
        response = self.client.post(reverse("book_service"), {})

        form = response.context["form"]
        for field in ["service_type", "vehicle_make_model", "registration_number", "address", "phone", "preferred_date", "time_slot"]:
            self.assertIn(field, form.errors)

    def test_vehicle_color_is_optional(self):
        response = self.client.post(reverse("book_service"), valid_payload(self.car, vehicle_color=""))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(ServiceRequest.objects.get().vehicle_color, "")


class BookingProfileTests(BookingTestCase):
    def test_form_is_prefilled_from_my_profile(self):
        Profile.objects.create(user=self.user, phone="9000000000", default_address="7 Church Street, Bengaluru")

        response = self.client.get(reverse("book_service"))

        form = response.context["form"]
        self.assertEqual(form.initial["phone"], "9000000000")
        self.assertEqual(form.initial["address"], "7 Church Street, Bengaluru")

    def test_users_without_a_profile_can_still_book(self):
        response = self.client.get(reverse("book_service"))

        self.assertEqual(response.status_code, 200)

    def test_remembering_details_saves_them_to_the_profile(self):
        self.client.post(reverse("book_service"), valid_payload(self.car))

        profile = Profile.objects.get(user=self.user)
        self.assertEqual(profile.phone, "+91 98765 43210")
        self.assertIn("12 MG Road", profile.default_address)

    def test_not_ticking_remember_leaves_the_profile_alone(self):
        payload = valid_payload(self.car)
        payload.pop("remember_details")

        self.client.post(reverse("book_service"), payload)

        self.assertFalse(Profile.objects.filter(user=self.user).exists())


class CancelRequestTests(BookingTestCase):
    def test_owner_can_cancel_a_pending_request(self):
        request = self.make_request()

        response = self.client.post(reverse("cancel_service", args=[request.pk]))

        request.refresh_from_db()
        self.assertRedirects(response, reverse("service_detail", args=[request.pk]))
        self.assertEqual(request.status, ServiceRequest.Status.CANCELLED)

    def test_a_request_already_in_progress_cannot_be_cancelled(self):
        request = self.make_request(status=ServiceRequest.Status.IN_PROGRESS)

        self.client.post(reverse("cancel_service", args=[request.pk]))

        request.refresh_from_db()
        self.assertEqual(request.status, ServiceRequest.Status.IN_PROGRESS)

    def test_cancelling_someone_elses_request_is_a_404(self):
        theirs = self.make_request(user=self.other)

        response = self.client.post(reverse("cancel_service", args=[theirs.pk]))

        self.assertEqual(response.status_code, 404)

    def test_cancelling_requires_post(self):
        request = self.make_request()

        response = self.client.get(reverse("cancel_service", args=[request.pk]))

        self.assertEqual(response.status_code, 405)


class ServiceAdminTests(BookingTestCase):
    def test_staff_can_manage_requests_from_the_admin(self):
        self.assertIn(ServiceRequest, admin_site._registry)

    def test_admin_actions_move_requests_along(self):
        admin = User.objects.create_superuser(username="boss", password="pw")
        self.client.login(username="boss", password="pw")
        request = self.make_request()

        response = self.client.post(
            reverse("admin:bookings_servicerequest_changelist"),
            {"action": "mark_confirmed", "_selected_action": [request.pk]},
        )

        request.refresh_from_db()
        self.assertEqual(response.status_code, 302)
        self.assertEqual(request.status, ServiceRequest.Status.CONFIRMED)
