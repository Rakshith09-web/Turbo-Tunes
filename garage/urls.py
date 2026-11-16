from django.urls import path
from garage import views

urlpatterns = [
    path("garage/", views.my_garage, name="my_garage"),
    path("garage/save/", views.save_build, name="save_build"),
]
