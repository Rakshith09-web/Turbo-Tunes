from django.contrib import admin
from cars.models import Car, CustomizationOption


class CustomizationOptionInline(admin.TabularInline):
    model = CustomizationOption
    extra = 1


@admin.register(Car)
class CarAdmin(admin.ModelAdmin):
    list_display = ("name", "brand")
    inlines = [CustomizationOptionInline]


@admin.register(CustomizationOption)
class CustomizationOptionAdmin(admin.ModelAdmin):
    list_display = ("car", "option_type", "label")
    list_filter = ("option_type",)
