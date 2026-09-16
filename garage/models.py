from django.contrib.auth.models import User
from django.db import models

from cars.models import Car


class SavedBuild(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_builds")
    car = models.ForeignKey(Car, on_delete=models.CASCADE)
    option_ids = models.CharField(max_length=255, help_text="Comma-separated CustomizationOption IDs")
    created_at = models.DateTimeField(auto_now_add=True)

    def get_option_id_list(self):
        return [int(value) for value in self.option_ids.split(",") if value]

    def __str__(self):
        return f"{self.user.username}'s {self.car}"
