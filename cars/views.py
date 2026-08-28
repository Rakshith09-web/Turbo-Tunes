from django.shortcuts import get_object_or_404, render
from cars.models import Car


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
        }
        for option in car.options.all()
    ]

    car_data = {
        "modelUrl": car.model_file.url if car.model_file else None,
        "options": options,
    }
    return render(request, "cars/customizer.html", {"car": car, "car_data": car_data})
