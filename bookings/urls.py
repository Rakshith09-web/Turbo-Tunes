from django.urls import path

from bookings import views

urlpatterns = [
    path("service/", views.my_requests, name="my_requests"),
    path("service/book/", views.book_service, name="book_service"),
    path("service/<int:pk>/", views.service_detail, name="service_detail"),
    path("service/<int:pk>/cancel/", views.cancel_service, name="cancel_service"),
]
