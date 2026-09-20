from django.shortcuts import get_object_or_404, render
from cars.models import Car
from garage.models import SavedBuild


def home(request):
    car = Car.objects.first()
    if car is None:
        return car_gallery(request)
    return car_customizer(request, car.id)


def car_gallery(request):
    cars = Car.objects.all()
    return render(request, "cars/gallery.html", {"cars": cars})


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
