from django.shortcuts import render
from cars.models import Car


def car_gallery(request):
    cars = Car.objects.all()
    return render(request, "cars/gallery.html", {"cars": cars})
