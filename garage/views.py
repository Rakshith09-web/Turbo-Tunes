import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from cars.models import Car
from garage.models import SavedBuild


@login_required
def my_garage(request):
    builds = list(request.user.saved_builds.select_related("car").order_by("-created_at"))
    return render(request, "garage/my_garage.html", {"builds": builds})


@login_required
@require_POST
def save_build(request):
    payload = json.loads(request.body)
    car = Car.objects.get(pk=payload["car_id"])
    option_ids = ",".join(str(oid) for oid in payload["option_ids"])

    build = SavedBuild.objects.create(user=request.user, car=car, option_ids=option_ids)
    return JsonResponse({"id": build.id})
