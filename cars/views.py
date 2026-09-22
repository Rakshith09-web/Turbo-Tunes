from collections import Counter

from django.contrib.staticfiles import finders
from django.shortcuts import get_object_or_404, render
from django.templatetags.static import static
from django.urls import reverse

from cars.models import Car
from garage.models import SavedBuild

# A realistic, unbranded SUV shown purely as decoration on the homepage — spinning behind the
# title as a watermark. It has no relation to the customizable catalog (no palette paint, no
# swappable parts), so it lives as a static asset rather than a Car row. See
# cars/static/cars/models/HERO_SUV_CREDIT.txt for the model's CC-BY attribution.
HERO_WATERMARK_PATH = "cars/models/hero-suv.glb"

HIGHLIGHT_ORDER = ["paint", "wheels", "exhaust", "interior", "decal"]
HIGHLIGHT_NOUNS = {
    "paint": ("paint colour", "paint colours"),
    "wheels": ("wheel design", "wheel designs"),
    "exhaust": ("exhaust style", "exhaust styles"),
    "interior": ("interior colour", "interior colours"),
    "decal": ("decal", "decals"),
}


def option_highlights(car):
    """Short phrases saying what can be customized on a car, e.g. "6 paint colours"."""
    counts = Counter()
    for option in car.options.all():
        if option.option_type == "decal" and not option.texture_file:
            continue  # the "None" choice, not a decal
        counts[option.option_type] += 1
    phrases = []
    for kind in HIGHLIGHT_ORDER:
        if counts[kind]:
            singular, plural = HIGHLIGHT_NOUNS[kind]
            phrases.append(f"{counts[kind]} {singular if counts[kind] == 1 else plural}")
    return phrases


def home(request):
    hero_data = None
    if finders.find(HERO_WATERMARK_PATH):
        # Not palette-painted — it keeps its own real-world materials, so no paintRegion applies.
        hero_data = {"modelUrl": static(HERO_WATERMARK_PATH), "paintMode": "none", "paintRegion": ""}
    return render(request, "cars/home.html", {"hero_data": hero_data})


def car_gallery(request):
    cars = Car.objects.exclude(model_file="").exclude(model_file=None).prefetch_related("options")
    showroom = [{"car": car, "highlights": option_highlights(car)} for car in cars]
    showroom_data = [
        {
            "id": car.id,
            "name": car.name,
            "modelUrl": car.model_file.url,
            "paintMode": car.paint_mode,
            "paintRegion": car.paint_region,
        }
        for car in cars
    ]
    return render(
        request, "cars/gallery.html", {"showroom": showroom, "showroom_data": showroom_data}
    )


def car_customizer(request, pk):
    car = get_object_or_404(Car, pk=pk)

    options = [
        {
            "id": option.id,
            "option_type": option.option_type,
            "label": option.label,
            "mesh_name": option.mesh_name,
            "color_hex": option.color_hex,
            "texture_url": option.texture_file.url if option.texture_file else None,
            "part_url": option.part_file.url if option.part_file else None,
        }
        for option in car.options.all()
    ]

    car_data = {
        "modelUrl": car.model_file.url if car.model_file else None,
        "options": options,
        "paintMode": car.paint_mode,
        "paintRegion": car.paint_region,
        "carId": car.id,
        "isAuthenticated": request.user.is_authenticated,
    }

    context = {"car": car, "car_data": car_data}

    build_id = request.GET.get("build")
    if build_id and request.user.is_authenticated:
        build = SavedBuild.objects.filter(pk=build_id, user=request.user, car=car).first()
        if build:
            context["selected_option_ids"] = build.get_option_id_list()

    return render(request, "cars/customizer.html", context)
