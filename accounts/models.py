from django.contrib.auth.models import User
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    phone = models.CharField(max_length=20, blank=True)
    default_address = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"Profile for {self.user.username}"
