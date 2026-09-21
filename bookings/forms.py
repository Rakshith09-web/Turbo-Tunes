import re
from datetime import date, timedelta

from django import forms

from bookings.models import VEHICLE_COLORS, ServiceRequest
from autocraft.formstyle import style_form
from cars.models import Car

MAX_DAYS_AHEAD = 90


class ServiceRequestForm(forms.ModelForm):
    remember_details = forms.BooleanField(
        required=False,
        initial=True,
        label="Remember my phone number and address for next time",
    )

    class Meta:
        model = ServiceRequest
        fields = [
            "service_type",
            "vehicle_make_model",
            "registration_number",
            "body_style",
            "vehicle_color",
            "address",
            "phone",
            "preferred_date",
            "time_slot",
            "notes",
        ]
        labels = {
            "service_type": "What does your car need?",
            "vehicle_make_model": "Make and model",
            "registration_number": "Registration number",
            "body_style": "Closest body style",
            "vehicle_color": "Colour",
            "address": "Where should we meet you?",
            "phone": "Phone number",
            "preferred_date": "Preferred date",
            "time_slot": "Time of day",
            "notes": "Anything we should know? (optional)",
        }
        widgets = {
            "service_type": forms.RadioSelect,
            "body_style": forms.RadioSelect,
            "vehicle_color": forms.RadioSelect,
            "time_slot": forms.RadioSelect,
            "vehicle_make_model": forms.TextInput(
                attrs={"placeholder": "Honda City, 2019", "autocomplete": "off"}
            ),
            "registration_number": forms.TextInput(
                attrs={"placeholder": "KA 01 AB 1234", "autocomplete": "off", "autocapitalize": "characters"}
            ),
            "address": forms.Textarea(
                attrs={"rows": 3, "placeholder": "House or building, street, landmark, area", "autocomplete": "street-address"}
            ),
            "phone": forms.TextInput(
                attrs={"placeholder": "+91 98765 43210", "type": "tel", "autocomplete": "tel"}
            ),
            "preferred_date": forms.DateInput(attrs={"type": "date"}),
            "notes": forms.Textarea(attrs={"rows": 3, "placeholder": "Noises, warning lights, parking instructions"}),
        }
        error_messages = {
            "service_type": {"required": "Choose what your car needs."},
            "vehicle_make_model": {"required": "Tell us the make and model of your car."},
            "registration_number": {"required": "Enter the registration number so the mechanic can spot your car."},
            "address": {"required": "Enter the address where we should meet you."},
            "phone": {"required": "Enter a phone number the mechanic can call."},
            "preferred_date": {"required": "Choose a date.", "invalid": "Enter a valid date."},
            "time_slot": {"required": "Choose a time of day."},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        cars = Car.objects.exclude(model_file="").exclude(model_file=None)
        self.fields["body_style"].queryset = cars
        self.fields["body_style"].empty_label = None
        self.fields["body_style"].label_from_instance = lambda car: car.name
        self.fields["service_type"].choices = ServiceRequest.ServiceType.choices
        self.fields["time_slot"].choices = ServiceRequest.TimeSlot.choices
        self.fields["body_style"].required = True
        self.fields["body_style"].error_messages["required"] = "Pick the body style closest to your car."
        self.fields["vehicle_color"].choices = VEHICLE_COLORS
        self.fields["vehicle_color"].widget.choices = VEHICLE_COLORS
        today = date.today()
        self.fields["preferred_date"].widget.attrs["min"] = today.isoformat()
        self.fields["preferred_date"].widget.attrs["max"] = (today + timedelta(days=MAX_DAYS_AHEAD)).isoformat()
        style_form(self)

    def clean_registration_number(self):
        raw = re.sub(r"\s+", " ", self.cleaned_data["registration_number"]).strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9 -]{2,18}[A-Z0-9]", raw):
            raise forms.ValidationError("Enter the registration number using letters and numbers only.")
        return raw

    def clean_phone(self):
        phone = self.cleaned_data["phone"].strip()
        digits = re.sub(r"\D", "", phone)
        if not re.fullmatch(r"\+?[0-9][0-9 \-]*", phone) or not 7 <= len(digits) <= 15:
            raise forms.ValidationError("Enter a valid phone number, like +91 98765 43210.")
        return phone

    def clean_address(self):
        address = self.cleaned_data["address"].strip()
        if len(address) < 10:
            raise forms.ValidationError(
                "Add a little more to the address (street and area) so we can find you."
            )
        return address

    def clean_preferred_date(self):
        chosen = self.cleaned_data["preferred_date"]
        today = date.today()
        if chosen < today:
            raise forms.ValidationError("That date is in the past. Choose today or a later date.")
        if chosen > today + timedelta(days=MAX_DAYS_AHEAD):
            raise forms.ValidationError(f"We take bookings up to {MAX_DAYS_AHEAD} days ahead.")
        return chosen
