from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from accounts.models import Profile
from bookings.forms import ServiceRequestForm
from bookings.models import VEHICLE_COLORS, ServiceRequest
from cars.models import Car


def style_data(car):
    return {
        "id": car.id,
        "name": car.name,
        "modelUrl": car.model_file.url,
        "paintMode": car.paint_mode,
        "paintRegion": car.paint_region,
    }


def display_data(service_request):
    """The booked car for the 3D view on the request page, or None if it can't be shown."""
    car = service_request.body_style
    if not car or not car.model_file:
        return None
    return {"style": style_data(car), "color": service_request.vehicle_color}


def preview_data(form):
    styles = [style_data(car) for car in form.fields["body_style"].queryset]
    return {"styles": styles, "colors": [{"hex": hex_value, "name": name} for hex_value, name in VEHICLE_COLORS]}


@login_required
def book_service(request):
    profile = Profile.objects.filter(user=request.user).first()

    if request.method == "POST":
        form = ServiceRequestForm(request.POST)
        if form.is_valid():
            service_request = form.save(commit=False)
            service_request.user = request.user
            service_request.save()

            if form.cleaned_data["remember_details"]:
                profile, _ = Profile.objects.get_or_create(user=request.user)
                profile.phone = service_request.phone
                profile.default_address = service_request.address
                profile.save()

            messages.success(
                request,
                f"Request received. Your reference is {service_request.reference}. We'll confirm your slot shortly.",
            )
            return redirect("service_detail", pk=service_request.pk)
    else:
        initial = {}
        if profile:
            initial = {"phone": profile.phone, "address": profile.default_address}
        first_style = Car.objects.exclude(model_file="").exclude(model_file=None).first()
        if first_style:
            initial["body_style"] = first_style.pk
        form = ServiceRequestForm(initial=initial)

    return render(request, "bookings/book.html", {"form": form, "preview": preview_data(form)})


@login_required
def my_requests(request):
    requests = request.user.service_requests.select_related("body_style")
    return render(request, "bookings/list.html", {"requests": requests})


@login_required
def service_detail(request, pk):
    service_request = get_object_or_404(
        ServiceRequest.objects.select_related("body_style"), pk=pk, user=request.user
    )
    return render(
        request,
        "bookings/detail.html",
        {"service_request": service_request, "car_display": display_data(service_request)},
    )


@login_required
@require_POST
def cancel_service(request, pk):
    service_request = get_object_or_404(ServiceRequest, pk=pk, user=request.user)
    if service_request.can_cancel:
        service_request.status = ServiceRequest.Status.CANCELLED
        service_request.save(update_fields=["status", "updated_at"])
        messages.success(request, f"Request {service_request.reference} has been cancelled.")
    else:
        messages.error(
            request,
            f"Request {service_request.reference} is already {service_request.get_status_display().lower()} "
            "and can't be cancelled here. Call us if something has changed.",
        )
    return redirect("service_detail", pk=service_request.pk)
