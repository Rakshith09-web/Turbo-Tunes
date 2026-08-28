from django.urls import path
from cars import views

urlpatterns = [
    path("", views.car_gallery, name="car_gallery"),
    path("cars/<int:pk>/", views.car_customizer, name="car_customizer"),
]
