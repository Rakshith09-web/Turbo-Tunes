# AutoCraft 3D — Phase 1 Implementation Plan (Car Catalog + 3D Customizer + Accounts + Saved Builds)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Django website where a visitor browses a car catalog, opens a car in an interactive Three.js 3D viewer (free orbit + 6 preset angles), live-customizes its paint/wheels/decals/interior/exhaust, and — once logged in — saves and reopens that build from "My Garage."

**Architecture:** Django monolith serving server-rendered HTML. Three Django apps: `cars` (catalog + customization option data), `accounts` (auth + profile), `garage` (saved builds). One JavaScript module (`viewer.js`, ES modules, no build step) drives the Three.js scene; it receives the selected car's model URL and options as JSON embedded via Django's `json_script` template filter and does all live customization client-side.

**Tech Stack:** Python 3 + Django 5.x, SQLite, Pillow (image fields), Three.js (loaded via CDN + import map — no npm/bundler), vanilla JavaScript (ES modules), Django templates + plain CSS.

## Global Constraints

- Django version: `Django>=5.0,<6.0` (per spec's tech stack).
- Database: SQLite for this phase (per spec — swap to Postgres later is out of scope here).
- No JS framework/build step — plain ES modules via `<script type="module">` and an import map (per spec: "keep your JS surface area as small as possible," user is a complete web beginner).
- 3D model format: `.glb` (glTF binary), loaded via Three.js's `GLTFLoader` (per spec).
- Every auth-gated view uses Django's `login_required` (per spec's error-handling section).
- Automated tests are written for all Python/Django code (models, views). The Three.js viewer is verified manually in-browser per task, per the spec's explicit decision not to force automated tests onto the 3D code.
- Not a git repository yet — Task 1 initializes one, since the "commit after every step" workflow below depends on it.

---

## File Structure

```
car/
  manage.py
  requirements.txt
  .gitignore
  autocraft/                     # Django project config
    __init__.py
    settings.py
    urls.py
    wsgi.py
    asgi.py
  templates/
    base.html                    # shared layout: nav, CSS include
  static/
    base.css
  cars/                          # catalog + customization option data
    __init__.py
    models.py                    # Car, CustomizationOption
    admin.py
    views.py                     # gallery, customizer
    urls.py
    tests.py
    templates/cars/
      gallery.html
      customizer.html
    static/cars/
      css/customizer.css
      js/viewer.js                # Three.js scene + customization logic
  accounts/                      # auth + profile
    __init__.py
    models.py                    # Profile
    forms.py                     # RegistrationForm
    views.py                     # register
    urls.py
    tests.py
    templates/accounts/
      register.html
      login.html
  garage/                        # saved builds
    __init__.py
    models.py                    # SavedBuild
    admin.py
    views.py                     # my_garage, save_build (JSON POST)
    urls.py
    tests.py
    templates/garage/
      my_garage.html
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `manage.py`, `autocraft/__init__.py`, `autocraft/settings.py`, `autocraft/urls.py`, `autocraft/wsgi.py`, `autocraft/asgi.py`
- Create: `requirements.txt`, `.gitignore`
- Create: `templates/base.html`, `static/base.css`

**Interfaces:**
- Produces: a runnable Django project named `autocraft`, with `TEMPLATES` configured to look in the project-level `templates/` dir, `STATIC_URL`/`STATICFILES_DIRS` pointing at `static/`, and `MEDIA_URL`/`MEDIA_ROOT` configured for uploaded car assets. Later tasks add `INSTALLED_APPS` entries and `include()` calls in `autocraft/urls.py`.

- [ ] **Step 1: Initialize git and a virtual environment**

```bash
git init
python -m venv .venv
```

Create `.gitignore`:

```
.venv/
__pycache__/
*.pyc
db.sqlite3
media/
```

- [ ] **Step 2: Install Django and Pillow, write requirements.txt**

```bash
.venv/Scripts/pip install "Django>=5.0,<6.0" "Pillow>=10.0"
.venv/Scripts/pip freeze > requirements.txt
```

- [ ] **Step 3: Start the Django project**

```bash
.venv/Scripts/django-admin startproject autocraft .
```

This creates `manage.py` and the `autocraft/` config package.

- [ ] **Step 4: Configure templates, static, and media in `autocraft/settings.py`**

Edit the `TEMPLATES` setting's `DIRS` list and add static/media config:

```python
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "car_gallery"
LOGOUT_REDIRECT_URL = "car_gallery"
```

- [ ] **Step 5: Serve media files in development, in `autocraft/urls.py`**

```python
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

urlpatterns = [
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

- [ ] **Step 6: Create the base template**

`templates/base.html`:

```html
{% load static %}
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{% block title %}AutoCraft 3D{% endblock %}</title>
  <link rel="stylesheet" href="{% static 'base.css' %}" />
  {% block extra_head %}{% endblock %}
</head>
<body>
  <nav class="site-nav">
    <a href="{% url 'car_gallery' %}" class="brand">AutoCraft 3D</a>
    <div class="nav-links">
      {% if user.is_authenticated %}
        <a href="{% url 'my_garage' %}">My Garage</a>
        <a href="{% url 'logout' %}">Log out</a>
      {% else %}
        <a href="{% url 'login' %}">Log in</a>
        <a href="{% url 'register' %}">Register</a>
      {% endif %}
    </div>
  </nav>
  <main>
    {% block content %}{% endblock %}
  </main>
</body>
</html>
```

`static/base.css`:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #0f0f12; color: #eee; }
.site-nav { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: #1a1a1f; }
.site-nav .brand { font-weight: bold; font-size: 1.25rem; color: #fff; text-decoration: none; }
.nav-links a { color: #ccc; text-decoration: none; margin-left: 1.5rem; }
.nav-links a:hover { color: #fff; }
main { padding: 2rem; }
```

- [ ] **Step 7: Verify the project boots**

```bash
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py runserver
```

Expected: no errors; visiting `http://127.0.0.1:8000/admin/` shows the Django admin login page. Stop the server (Ctrl+C).

- [ ] **Step 8: Commit**

```bash
git add manage.py autocraft requirements.txt .gitignore templates static
git commit -m "chore: scaffold Django project with base template and static/media config"
```

---

### Task 2: `cars` App — Data Models

**Files:**
- Create: `cars/__init__.py`, `cars/models.py`, `cars/admin.py`
- Test: `cars/tests.py`

**Interfaces:**
- Consumes: nothing (first app-level task).
- Produces: `Car` model (fields: `name`, `brand`, `description`, `thumbnail`, `model_file`, `__str__`) and `CustomizationOption` model (fields: `car` FK, `option_type` [one of `paint`/`wheels`/`decal`/`interior`/`exhaust`], `label`, `mesh_name`, `color_hex`, `texture_file`, `__str__`). Both registered in Django admin. Later tasks import `Car` and `CustomizationOption` from `cars.models`.

- [ ] **Step 1: Create the app**

```bash
.venv/Scripts/python manage.py startapp cars
```

Add `"cars"` to `INSTALLED_APPS` in `autocraft/settings.py`.

- [ ] **Step 2: Write the failing test**

`cars/tests.py`:

```python
from django.test import TestCase
from cars.models import Car, CustomizationOption


class CarModelTests(TestCase):
    def test_car_str_includes_brand_and_name(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        self.assertEqual(str(car), "Volt Motors Model S")

    def test_customization_option_linked_to_car(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car,
            option_type=CustomizationOption.OptionType.PAINT,
            label="Racing Red",
            mesh_name="Body",
            color_hex="#CC0000",
        )
        self.assertEqual(option.car, car)
        self.assertIn(option, car.options.all())
        self.assertEqual(option.option_type, "paint")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
.venv/Scripts/python manage.py test cars
```

Expected: FAIL — `ImportError: cannot import name 'Car' from 'cars.models'` (models don't exist yet).

- [ ] **Step 3: Write the models**

`cars/models.py`:

```python
from django.db import models


class Car(models.Model):
    name = models.CharField(max_length=100)
    brand = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    thumbnail = models.ImageField(upload_to="cars/thumbnails/")
    model_file = models.FileField(upload_to="cars/models/")

    def __str__(self):
        return f"{self.brand} {self.name}"


class CustomizationOption(models.Model):
    class OptionType(models.TextChoices):
        PAINT = "paint", "Paint Colour"
        WHEELS = "wheels", "Wheels"
        DECAL = "decal", "Decal"
        INTERIOR = "interior", "Interior Colour"
        EXHAUST = "exhaust", "Exhaust"

    car = models.ForeignKey(Car, on_delete=models.CASCADE, related_name="options")
    option_type = models.CharField(max_length=20, choices=OptionType.choices)
    label = models.CharField(max_length=100)
    mesh_name = models.CharField(
        max_length=100,
        help_text="Exact mesh/object name inside the car's .glb file that this option targets.",
    )
    color_hex = models.CharField(
        max_length=7, blank=True, help_text="Used for paint/interior options, e.g. #CC0000"
    )
    texture_file = models.ImageField(
        upload_to="cars/textures/", blank=True, null=True, help_text="Used for decal options."
    )

    def __str__(self):
        return f"{self.car} - {self.label}"
```

`cars/admin.py`:

```python
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
```

- [ ] **Step 4: Make and apply migrations**

```bash
.venv/Scripts/python manage.py makemigrations cars
.venv/Scripts/python manage.py migrate
```

- [ ] **Step 5: Run test to verify it passes**

```bash
.venv/Scripts/python manage.py test cars
```

Expected: `OK` (2 tests pass).

- [ ] **Step 6: Commit**

```bash
git add cars requirements.txt autocraft/settings.py
git commit -m "feat: add Car and CustomizationOption models with admin registration"
```

---

### Task 3: Car Gallery View

**Files:**
- Create: `cars/urls.py`, `cars/templates/cars/gallery.html`
- Modify: `cars/views.py`, `autocraft/urls.py`
- Test: `cars/tests.py`

**Interfaces:**
- Consumes: `cars.models.Car`.
- Produces: URL name `car_gallery` (`/`), rendering all `Car` rows. Later tasks link to `car_customizer` from here (added in Task 6).

- [ ] **Step 1: Write the failing test**

Append to `cars/tests.py`:

```python
from django.urls import reverse


class CarGalleryViewTests(TestCase):
    def test_gallery_lists_all_cars(self):
        Car.objects.create(name="Model S", brand="Volt Motors")
        Car.objects.create(name="Ranger", brand="Trailblaze")

        response = self.client.get(reverse("car_gallery"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Model S")
        self.assertContains(response, "Ranger")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
.venv/Scripts/python manage.py test cars
```

Expected: FAIL — `NoReverseMatch: 'car_gallery' not found` (URL doesn't exist yet).

- [ ] **Step 3: Write the view, URLs, and template**

`cars/views.py`:

```python
from django.shortcuts import render
from cars.models import Car


def car_gallery(request):
    cars = Car.objects.all()
    return render(request, "cars/gallery.html", {"cars": cars})
```

`cars/urls.py`:

```python
from django.urls import path
from cars import views

urlpatterns = [
    path("", views.car_gallery, name="car_gallery"),
]
```

`autocraft/urls.py` — add the include:

```python
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("cars.urls")),
]
```

`cars/templates/cars/gallery.html`:

```html
{% extends "base.html" %}
{% load static %}
{% block title %}Car Gallery — AutoCraft 3D{% endblock %}
{% block content %}
  <h1>Choose a car</h1>
  <div class="car-grid">
    {% for car in cars %}
      <div class="car-card">
        {% if car.thumbnail %}
          <img src="{{ car.thumbnail.url }}" alt="{{ car }}" />
        {% endif %}
        <h2>{{ car }}</h2>
        <p>{{ car.description }}</p>
      </div>
    {% empty %}
      <p>No cars yet — add one in the admin panel.</p>
    {% endfor %}
  </div>
{% endblock %}
```

Add a bit of CSS to `static/base.css`:

```css
.car-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem; }
.car-card { background: #1a1a1f; border-radius: 8px; padding: 1rem; }
.car-card img { width: 100%; border-radius: 4px; }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
.venv/Scripts/python manage.py test cars
```

Expected: `OK` (3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add cars autocraft/urls.py static/base.css
git commit -m "feat: add car gallery page"
```

---

### Task 4: `accounts` App — Registration, Login, Profile

**Files:**
- Create: `accounts/__init__.py`, `accounts/models.py`, `accounts/forms.py`, `accounts/urls.py`
- Create: `accounts/templates/accounts/register.html`, `accounts/templates/accounts/login.html`
- Modify: `accounts/views.py`, `autocraft/urls.py`
- Test: `accounts/tests.py`

**Interfaces:**
- Consumes: Django's built-in `django.contrib.auth` (`User`, `LoginView`, `LogoutView`).
- Produces: `accounts.models.Profile` (OneToOne to `User`, fields `phone`, `default_address`), URL names `register`, `login`, `logout`. Later tasks (`garage`) rely on `request.user` being authenticated via these views.

- [ ] **Step 1: Create the app**

```bash
.venv/Scripts/python manage.py startapp accounts
```

Add `"accounts"` and `"django.contrib.auth"` (already default) to `INSTALLED_APPS`.

- [ ] **Step 2: Write the failing test**

`accounts/tests.py`:

```python
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from accounts.models import Profile


class RegistrationTests(TestCase):
    def test_registration_creates_user_and_profile(self):
        response = self.client.post(
            reverse("register"),
            {
                "username": "jane",
                "password1": "a-strong-pass-1",
                "password2": "a-strong-pass-1",
            },
        )

        self.assertEqual(response.status_code, 302)
        user = User.objects.get(username="jane")
        self.assertTrue(Profile.objects.filter(user=user).exists())

    def test_registered_user_can_log_in(self):
        self.client.post(
            reverse("register"),
            {
                "username": "jane",
                "password1": "a-strong-pass-1",
                "password2": "a-strong-pass-1",
            },
        )
        logged_in = self.client.login(username="jane", password="a-strong-pass-1")
        self.assertTrue(logged_in)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
.venv/Scripts/python manage.py test accounts
```

Expected: FAIL — `NoReverseMatch: 'register' not found`.

- [ ] **Step 3: Write the model, form, view, and templates**

`accounts/models.py`:

```python
from django.contrib.auth.models import User
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    phone = models.CharField(max_length=20, blank=True)
    default_address = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"Profile for {self.user.username}"
```

`accounts/forms.py`:

```python
from django.contrib.auth.forms import UserCreationForm


class RegistrationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        fields = ("username",)
```

`accounts/views.py`:

```python
from django.shortcuts import redirect, render
from accounts.forms import RegistrationForm
from accounts.models import Profile


def register(request):
    if request.method == "POST":
        form = RegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            Profile.objects.create(user=user)
            return redirect("login")
    else:
        form = RegistrationForm()
    return render(request, "accounts/register.html", {"form": form})
```

`accounts/urls.py`:

```python
from django.contrib.auth import views as auth_views
from django.urls import path
from accounts import views

urlpatterns = [
    path("register/", views.register, name="register"),
    path("login/", auth_views.LoginView.as_view(template_name="accounts/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
]
```

`autocraft/urls.py` — add the include:

```python
path("accounts/", include("accounts.urls")),
```

`accounts/templates/accounts/register.html`:

```html
{% extends "base.html" %}
{% block title %}Register — AutoCraft 3D{% endblock %}
{% block content %}
  <h1>Create an account</h1>
  <form method="post">
    {% csrf_token %}
    {{ form.as_p }}
    <button type="submit">Register</button>
  </form>
{% endblock %}
```

`accounts/templates/accounts/login.html`:

```html
{% extends "base.html" %}
{% block title %}Log in — AutoCraft 3D{% endblock %}
{% block content %}
  <h1>Log in</h1>
  <form method="post">
    {% csrf_token %}
    {{ form.as_p }}
    <button type="submit">Log in</button>
  </form>
{% endblock %}
```

- [ ] **Step 4: Make and apply migrations**

```bash
.venv/Scripts/python manage.py makemigrations accounts
.venv/Scripts/python manage.py migrate
```

- [ ] **Step 5: Run test to verify it passes**

```bash
.venv/Scripts/python manage.py test accounts
```

Expected: `OK` (2 tests pass).

- [ ] **Step 6: Commit**

```bash
git add accounts autocraft
git commit -m "feat: add accounts app with registration, login, and Profile model"
```

---

### Task 5: Prepare the First Real Car Asset

**Files:**
- No code files — this is a content-preparation task. Produces data in the database (via the admin UI built in Task 2) and a `.glb` file under `media/cars/models/`.

**Interfaces:**
- Consumes: the admin panel from Task 2 (`Car`, `CustomizationOption`).
- Produces: one real `Car` row with a working `.glb`, and its `CustomizationOption` rows — the first real data Tasks 6–8 will render and manipulate. Later tasks assume at least one `Car` exists with a `model_file` and a handful of `CustomizationOption`s.

- [ ] **Step 1: Source a free, separable car model**

Search a CC0/free-license 3D asset site (e.g. Kenney.nl's game-asset packs, or Sketchfab filtered to "Downloadable" + a CC license) for a low-poly car with **separate wheel meshes** and, ideally, a separate body/interior — this matters more than visual realism for now. Download it in glTF (`.gltf`/`.glb`) format if available; otherwise download `.fbx`/`.obj` and convert (next step).

- [ ] **Step 2: Inspect and rename meshes in Blender (free)**

Open the model in [Blender](https://www.blender.org/) (free, industry-standard, real skill to note in your report). In the Outliner panel, rename the meshes to clear, consistent names, e.g.:

- `Body` (main paintable shell)
- `Interior` (seats/dash, if present)
- `Wheel_Sport_FL`, `Wheel_Sport_FR`, `Wheel_Sport_RL`, `Wheel_Sport_RR` (the model's original wheels, renamed)
- Optionally duplicate the wheel geometry, reshape/resize it slightly, and rename the copies `Wheel_Offroad_FL` etc., positioned at the same 4 locations but hidden by default (Blender's "disable in viewport" — Three.js will control visibility at runtime instead, so leave them visible in the exported file; the `mesh_name` you record in Task 8's admin data determines what's shown).
- Same idea for `Exhaust_Standard` / `Exhaust_Sport` if the model has (or you add) a rear exhaust tip.

Export via `File > Export > glTF 2.0 (.glb)`.

- [ ] **Step 3: Place the file and create the database rows**

Put the exported file somewhere convenient (it will be uploaded through the admin, not committed to git — `media/` is in `.gitignore`).

```bash
.venv/Scripts/python manage.py createsuperuser
.venv/Scripts/python manage.py runserver
```

Visit `http://127.0.0.1:8000/admin/`, log in, and:
1. Add a `Car` (name, brand, thumbnail image, and the `.glb` as `model_file`).
2. Add `CustomizationOption` rows for it (via the inline on the Car admin page) — at minimum 2–3 paint colours (`option_type=paint`, `mesh_name=Body`, distinct `color_hex` values) so Task 8 has something to click between.

- [ ] **Step 4: Verify in the gallery**

```bash
.venv/Scripts/python manage.py test
```

Expected: still `OK` (no code changed, this step just confirms nothing broke). Then manually visit `http://127.0.0.1:8000/` and confirm the new car's thumbnail and name appear.

- [ ] **Step 5: Commit**

Nothing to commit (media/ and db.sqlite3 are gitignored) — skip. If you renamed/adjusted any code while doing this, commit that separately.

---

### Task 6: Car Customizer View

**Files:**
- Create: `cars/templates/cars/customizer.html`
- Modify: `cars/views.py`, `cars/urls.py`
- Test: `cars/tests.py`

**Interfaces:**
- Consumes: `cars.models.Car`, `cars.models.CustomizationOption`.
- Produces: URL name `car_customizer` (`/cars/<int:pk>/`), which renders a page containing a `<div id="viewer">`, an empty `<div id="options-panel">`, and two `json_script` blocks: `car-data` (`{ modelUrl, options: [...] }`) and, if `?build=<id>` is present and owned by the logged-in user, `selected-options` (list of option IDs) — wired up fully in Task 10. Task 7's `viewer.js` reads `car-data` by ID.

- [ ] **Step 1: Write the failing test**

Append to `cars/tests.py`:

```python
class CarCustomizerViewTests(TestCase):
    def test_customizer_page_embeds_car_and_options_json(self):
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        CustomizationOption.objects.create(
            car=car,
            option_type=CustomizationOption.OptionType.PAINT,
            label="Racing Red",
            mesh_name="Body",
            color_hex="#CC0000",
        )

        response = self.client.get(reverse("car_customizer", args=[car.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Racing Red")
        self.assertContains(response, "car-data")

    def test_customizer_404s_for_unknown_car(self):
        response = self.client.get(reverse("car_customizer", args=[9999]))
        self.assertEqual(response.status_code, 404)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
.venv/Scripts/python manage.py test cars
```

Expected: FAIL — `NoReverseMatch: 'car_customizer' not found`.

- [ ] **Step 3: Write the view, URL, and template**

`cars/views.py` — add:

```python
from django.shortcuts import get_object_or_404, render
from cars.models import Car


def car_customizer(request, pk):
    car = get_object_or_404(Car, pk=pk)
    options = list(
        car.options.values("id", "option_type", "label", "mesh_name", "color_hex", "texture_file")
    )
    for option in options:
        option["texture_url"] = (
            f"{settings.MEDIA_URL}{option['texture_file']}" if option["texture_file"] else None
        )

    car_data = {
        "modelUrl": car.model_file.url,
        "options": options,
    }
    return render(request, "cars/customizer.html", {"car": car, "car_data": car_data})
```

Add `from django.conf import settings` to the top of `cars/views.py`.

`cars/urls.py` — add:

```python
path("cars/<int:pk>/", views.car_customizer, name="car_customizer"),
```

`cars/templates/cars/customizer.html`:

```html
{% extends "base.html" %}
{% load static %}
{% block title %}{{ car }} — Customizer{% endblock %}
{% block extra_head %}
  <link rel="stylesheet" href="{% static 'cars/css/customizer.css' %}" />
{% endblock %}
{% block content %}
  <h1>{{ car }}</h1>
  {{ car_data|json_script:"car-data" }}
  <div class="customizer-layout">
    <div id="viewer"></div>
    <aside id="options-panel"></aside>
  </div>
{% endblock %}
```

`cars/static/cars/css/customizer.css`:

```css
.customizer-layout { display: flex; gap: 1.5rem; margin-top: 1rem; }
#viewer { flex: 1; height: 480px; background: #050506; border-radius: 8px; position: relative; }
#options-panel { width: 260px; }
.option-group { margin-bottom: 1.25rem; }
.option-group h3 { text-transform: capitalize; margin-bottom: 0.5rem; }
.swatch-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.swatch { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
.swatch.selected { border-color: #fff; }
.option-button { display: block; width: 100%; text-align: left; padding: 0.5rem; margin-bottom: 0.25rem; background: #1a1a1f; color: #eee; border: 1px solid #333; border-radius: 4px; cursor: pointer; }
.option-button.selected { border-color: #4da3ff; }
.view-presets { display: flex; gap: 0.5rem; position: absolute; bottom: 0.75rem; left: 0.75rem; }
.view-presets button { background: #1a1a1f; color: #eee; border: 1px solid #333; border-radius: 4px; padding: 0.35rem 0.6rem; cursor: pointer; }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
.venv/Scripts/python manage.py test cars
```

Expected: `OK` (5 tests pass).

- [ ] **Step 5: Commit**

```bash
git add cars
git commit -m "feat: add car customizer page with embedded car/options JSON"
```

---

### Task 7: Three.js Viewer Core (Load Model, Orbit, Preset Views)

**Files:**
- Create: `cars/static/cars/js/viewer.js`
- Modify: `cars/templates/cars/customizer.html`

**Interfaces:**
- Consumes: the `car-data` JSON block from Task 6 (`{ modelUrl, options }`).
- Produces: a rendered, orbit-able Three.js scene; six preset-view buttons; and module-level state (`scene`, `carRoot`, `optionsByType`) that Task 8 imports/extends to wire up live customization.

- [ ] **Step 1: Add the import map and module script to the customizer template**

`cars/templates/cars/customizer.html` — add inside `{% block extra_head %}`, after the CSS link:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
```

And at the end of `{% block content %}`, after the `.customizer-layout` div:

```html
<script type="module" src="{% static 'cars/js/viewer.js' %}"></script>
```

- [ ] **Step 2: Write the viewer core**

`cars/static/cars/js/viewer.js`:

```javascript
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const carData = JSON.parse(document.getElementById("car-data").textContent);
const viewerEl = document.getElementById("viewer");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050506);

const camera = new THREE.PerspectiveCamera(
  45,
  viewerEl.clientWidth / viewerEl.clientHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(5, 10, 7);
scene.add(keyLight);

let carRoot = null;

function frameCameraFromDirection(direction) {
  if (!carRoot) return;
  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.8;

  camera.position.copy(center.clone().add(direction.clone().normalize().multiplyScalar(distance)));
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0.2, 1),
  rear: new THREE.Vector3(0, 0.2, -1),
  left: new THREE.Vector3(-1, 0.2, 0),
  right: new THREE.Vector3(1, 0.2, 0),
  top: new THREE.Vector3(0, 1, 0.01),
  bottom: new THREE.Vector3(0, -1, 0.01),
};

function addViewPresetButtons() {
  const bar = document.createElement("div");
  bar.className = "view-presets";
  Object.keys(VIEW_DIRECTIONS).forEach((name) => {
    const btn = document.createElement("button");
    btn.textContent = name[0].toUpperCase() + name.slice(1);
    btn.addEventListener("click", () => frameCameraFromDirection(VIEW_DIRECTIONS[name]));
    bar.appendChild(btn);
  });
  viewerEl.appendChild(bar);
}

new GLTFLoader().load(
  carData.modelUrl,
  (gltf) => {
    carRoot = gltf.scene;
    scene.add(carRoot);
    frameCameraFromDirection(VIEW_DIRECTIONS.front);
    addViewPresetButtons();
  },
  undefined,
  (error) => {
    viewerEl.innerHTML = "<p style='color:#f88;padding:1rem;'>Couldn't load this car's 3D model.</p>";
    console.error("GLTF load failed:", error);
  }
);

function onResize() {
  camera.aspect = viewerEl.clientWidth / viewerEl.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

export { scene, carData };
```

- [ ] **Step 3: Manually verify in the browser**

```bash
.venv/Scripts/python manage.py runserver
```

Visit `http://127.0.0.1:8000/cars/<id>/` for the car created in Task 5. Checklist:
- The 3D model appears (not a blank black box).
- Click-dragging inside the viewer orbits the camera around the car.
- Scrolling zooms in/out.
- Each of the six preset buttons (Front/Rear/Left/Right/Top/Bottom) moves the camera to a distinct, sensible angle.
- Resizing the browser window doesn't distort or clip the canvas.

If the model doesn't load, open the browser console (F12) and check for a 404 (wrong `model_file` path) or a GLTF parse error (re-export from Blender).

- [ ] **Step 4: Commit**

```bash
git add cars/static/cars/js/viewer.js cars/templates/cars/customizer.html
git commit -m "feat: add Three.js viewer with orbit controls and preset camera views"
```

---

### Task 8: Live Customization Panel

**Files:**
- Modify: `cars/static/cars/js/viewer.js`

**Interfaces:**
- Consumes: `carData.options` (from Task 7), `scene`/`carRoot` (module-level, from Task 7).
- Produces: a populated `#options-panel`, and an `applyOption(option)` function plus module-level `optionsByType` map. Task 10 calls `getSelectedOptionIds()` (added here) when the user saves a build.

- [ ] **Step 1: Group options by type and track selection state**

Add near the top of `cars/static/cars/js/viewer.js`, after `const carData = ...`:

```javascript
const optionsByType = {};
carData.options.forEach((option) => {
  if (!optionsByType[option.option_type]) optionsByType[option.option_type] = [];
  optionsByType[option.option_type].push(option);
});

const selectedOptionIds = new Set();
```

- [ ] **Step 2: Write `applyOption` and the panel-building code**

Add after the `frameCameraFromDirection` function:

```javascript
function applyOption(option) {
  if (!carRoot) return;
  const target = carRoot.getObjectByName(option.mesh_name);
  if (!target) {
    console.warn(`Mesh "${option.mesh_name}" not found in this car's model.`);
    return;
  }

  if (option.option_type === "paint" || option.option_type === "interior") {
    target.material = target.material.clone();
    target.material.color.set(option.color_hex);
  } else if (option.option_type === "decal") {
    new THREE.TextureLoader().load(option.texture_url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      target.material = target.material.clone();
      target.material.map = texture;
      target.material.needsUpdate = true;
    });
  } else if (option.option_type === "wheels" || option.option_type === "exhaust") {
    optionsByType[option.option_type].forEach((sibling) => {
      const siblingMesh = carRoot.getObjectByName(sibling.mesh_name);
      if (siblingMesh) siblingMesh.visible = sibling.id === option.id;
    });
  }

  selectedOptionIds.add(option.id);
  optionsByType[option.option_type]
    .filter((sibling) => sibling.id !== option.id)
    .forEach((sibling) => selectedOptionIds.delete(sibling.id));

  refreshPanelSelection();
}

function refreshPanelSelection() {
  document.querySelectorAll("[data-option-id]").forEach((el) => {
    const id = Number(el.dataset.optionId);
    el.classList.toggle("selected", selectedOptionIds.has(id));
  });
}

function buildOptionsPanel() {
  const panel = document.getElementById("options-panel");
  panel.innerHTML = "";

  Object.entries(optionsByType).forEach(([type, options]) => {
    const group = document.createElement("div");
    group.className = "option-group";

    const heading = document.createElement("h3");
    heading.textContent = type;
    group.appendChild(heading);

    const isColorType = type === "paint" || type === "interior";
    const row = document.createElement("div");
    row.className = isColorType ? "swatch-row" : "";

    options.forEach((option) => {
      const el = document.createElement(isColorType ? "div" : "button");
      el.dataset.optionId = option.id;
      el.title = option.label;
      if (isColorType) {
        el.className = "swatch";
        el.style.backgroundColor = option.color_hex;
      } else {
        el.className = "option-button";
        el.textContent = option.label;
      }
      el.addEventListener("click", () => applyOption(option));
      row.appendChild(el);
    });

    group.appendChild(row);
    panel.appendChild(group);
  });
}

function getSelectedOptionIds() {
  return Array.from(selectedOptionIds);
}
```

- [ ] **Step 3: Call `buildOptionsPanel` once the model has loaded, and export the new function**

In the `GLTFLoader().load(...)` success callback, after `addViewPresetButtons();`, add:

```javascript
buildOptionsPanel();
```

Update the `export` line at the bottom of the file:

```javascript
export { scene, carData, getSelectedOptionIds };
```

- [ ] **Step 4: Manually verify in the browser**

Reload the customizer page. Checklist:
- The options panel on the right shows a group per option type present on this car (e.g. "paint" with colour swatches).
- Clicking a paint swatch recolours the car body live.
- The clicked swatch/button gets a visible "selected" outline; clicking a different one in the same group moves the outline (only one selected per group).
- If you added wheel/exhaust variant meshes in Task 5, clicking between them shows/hides the correct meshes.
- No errors in the browser console (F12) after clicking through every option.

- [ ] **Step 5: Commit**

```bash
git add cars/static/cars/js/viewer.js
git commit -m "feat: wire up live customization panel (paint, wheels, decals, interior, exhaust)"
```

---

### Task 9: `garage` App — SavedBuild Model and Save Endpoint

**Files:**
- Create: `garage/__init__.py`, `garage/models.py`, `garage/admin.py`, `garage/urls.py`
- Create: `garage/templates/garage/my_garage.html`
- Modify: `garage/views.py`, `autocraft/urls.py`
- Test: `garage/tests.py`

**Interfaces:**
- Consumes: `cars.models.Car`, `cars.models.CustomizationOption`, `django.contrib.auth.models.User`.
- Produces: `garage.models.SavedBuild` (fields: `user` FK, `car` FK, `option_ids` — stored as a comma-separated string of `CustomizationOption` IDs — `created_at`), URL names `my_garage` (`GET /garage/`) and `save_build` (`POST /garage/save/`, expects JSON `{ car_id, option_ids }`, returns JSON `{ id }` on success, requires login). Task 10 calls `save_build` from `viewer.js`.

- [ ] **Step 1: Create the app**

```bash
.venv/Scripts/python manage.py startapp garage
```

Add `"garage"` to `INSTALLED_APPS`.

- [ ] **Step 2: Write the failing tests**

`garage/tests.py`:

```python
import json

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from cars.models import Car, CustomizationOption
from garage.models import SavedBuild


class SavedBuildModelTests(TestCase):
    def test_saved_build_links_user_car_and_options(self):
        user = User.objects.create_user(username="jane", password="pw")
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )

        build = SavedBuild.objects.create(user=user, car=car, option_ids=str(option.id))

        self.assertEqual(build.user, user)
        self.assertEqual(build.car, car)
        self.assertEqual(build.get_option_id_list(), [option.id])


class SaveBuildViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="jane", password="pw")
        self.car = Car.objects.create(name="Model S", brand="Volt Motors")
        self.option = CustomizationOption.objects.create(
            car=self.car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )

    def test_anonymous_user_cannot_save_a_build(self):
        response = self.client.post(
            reverse("save_build"),
            data=json.dumps({"car_id": self.car.id, "option_ids": [self.option.id]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)  # redirected to login
        self.assertEqual(SavedBuild.objects.count(), 0)

    def test_logged_in_user_can_save_a_build(self):
        self.client.login(username="jane", password="pw")
        response = self.client.post(
            reverse("save_build"),
            data=json.dumps({"car_id": self.car.id, "option_ids": [self.option.id]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        build = SavedBuild.objects.get()
        self.assertEqual(build.user, self.user)
        self.assertEqual(build.get_option_id_list(), [self.option.id])

    def test_my_garage_lists_only_the_current_users_builds(self):
        other_user = User.objects.create_user(username="bob", password="pw")
        SavedBuild.objects.create(user=self.user, car=self.car, option_ids=str(self.option.id))
        SavedBuild.objects.create(user=other_user, car=self.car, option_ids=str(self.option.id))

        self.client.login(username="jane", password="pw")
        response = self.client.get(reverse("my_garage"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.context["builds"]), 1)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/Scripts/python manage.py test garage
```

Expected: FAIL — `ImportError: cannot import name 'SavedBuild' from 'garage.models'`.

- [ ] **Step 3: Write the model, view, urls, admin, and template**

`garage/models.py`:

```python
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
```

`garage/admin.py`:

```python
from django.contrib import admin
from garage.models import SavedBuild

admin.site.register(SavedBuild)
```

`garage/views.py`:

```python
import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from cars.models import Car
from garage.models import SavedBuild


@login_required
def my_garage(request):
    builds = list(request.user.saved_builds.select_related("car").order_by("-created_at"))
    return render(request, "garage/my_garage.html", {"builds": builds})


@login_required
@require_POST
def save_build(request):
    payload = json.loads(request.body)
    car = Car.objects.get(pk=payload["car_id"])
    option_ids = ",".join(str(oid) for oid in payload["option_ids"])

    build = SavedBuild.objects.create(user=request.user, car=car, option_ids=option_ids)
    return JsonResponse({"id": build.id})
```

`garage/urls.py`:

```python
from django.urls import path
from garage import views

urlpatterns = [
    path("garage/", views.my_garage, name="my_garage"),
    path("garage/save/", views.save_build, name="save_build"),
]
```

`autocraft/urls.py` — add the include:

```python
path("", include("garage.urls")),
```

`garage/templates/garage/my_garage.html`:

```html
{% extends "base.html" %}
{% block title %}My Garage — AutoCraft 3D{% endblock %}
{% block content %}
  <h1>My Garage</h1>
  <div class="car-grid">
    {% for build in builds %}
      <div class="car-card">
        <h2>{{ build.car }}</h2>
        <p>Saved {{ build.created_at|date:"d M Y, H:i" }}</p>
        <a href="{% url 'car_customizer' build.car.id %}?build={{ build.id }}">Open</a>
      </div>
    {% empty %}
      <p>No saved builds yet — customize a car and save it to see it here.</p>
    {% endfor %}
  </div>
{% endblock %}
```

- [ ] **Step 4: Make and apply migrations**

```bash
.venv/Scripts/python manage.py makemigrations garage
.venv/Scripts/python manage.py migrate
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
.venv/Scripts/python manage.py test garage
```

Expected: `OK` (4 tests pass).

- [ ] **Step 6: Commit**

```bash
git add garage autocraft/urls.py autocraft/settings.py
git commit -m "feat: add garage app with SavedBuild model, save endpoint, and My Garage page"
```

---

### Task 10: Wire "Save My Build" and Reopening a Saved Build

**Files:**
- Modify: `cars/views.py`, `cars/templates/cars/customizer.html`, `cars/static/cars/js/viewer.js`
- Test: `cars/tests.py`

**Interfaces:**
- Consumes: `garage`'s `save_build` endpoint (Task 9), `getSelectedOptionIds`/`optionsByType`/`applyOption` (Task 8).
- Produces: a "Save my build" button in the customizer UI; when the page URL includes `?build=<id>` and the build belongs to the logged-in user, the view embeds a `selected-options` JSON block that `viewer.js` applies automatically after the model loads.

- [ ] **Step 1: Write the failing test**

Append to `cars/tests.py`:

```python
from django.contrib.auth.models import User
from garage.models import SavedBuild


class CarCustomizerReopenBuildTests(TestCase):
    def test_customizer_embeds_selected_options_for_owned_build(self):
        user = User.objects.create_user(username="jane", password="pw")
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )
        build = SavedBuild.objects.create(user=user, car=car, option_ids=str(option.id))

        self.client.login(username="jane", password="pw")
        response = self.client.get(reverse("car_customizer", args=[car.pk]) + f"?build={build.id}")

        self.assertContains(response, "selected-options")

    def test_customizer_ignores_build_owned_by_another_user(self):
        owner = User.objects.create_user(username="jane", password="pw")
        other = User.objects.create_user(username="bob", password="pw")
        car = Car.objects.create(name="Model S", brand="Volt Motors")
        option = CustomizationOption.objects.create(
            car=car, option_type="paint", label="Red", mesh_name="Body", color_hex="#F00"
        )
        build = SavedBuild.objects.create(user=owner, car=car, option_ids=str(option.id))

        self.client.login(username="bob", password="pw")
        response = self.client.get(reverse("car_customizer", args=[car.pk]) + f"?build={build.id}")

        self.assertNotContains(response, "selected-options")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/Scripts/python manage.py test cars
```

Expected: FAIL — first test fails because `selected-options` is never rendered.

- [ ] **Step 3: Update the view to embed selected options**

`cars/views.py` — replace `car_customizer` with:

```python
def car_customizer(request, pk):
    car = get_object_or_404(Car, pk=pk)
    options = list(
        car.options.values("id", "option_type", "label", "mesh_name", "color_hex", "texture_file")
    )
    for option in options:
        option["texture_url"] = (
            f"{settings.MEDIA_URL}{option['texture_file']}" if option["texture_file"] else None
        )

    car_data = {"modelUrl": car.model_file.url, "options": options}

    context = {"car": car, "car_data": car_data}

    build_id = request.GET.get("build")
    if build_id and request.user.is_authenticated:
        build = SavedBuild.objects.filter(pk=build_id, user=request.user, car=car).first()
        if build:
            context["selected_option_ids"] = build.get_option_id_list()

    return render(request, "cars/customizer.html", context)
```

Add `from garage.models import SavedBuild` to the top of `cars/views.py`.

- [ ] **Step 4: Embed the selected-build JSON block in the template**

`cars/templates/cars/customizer.html` — replace the body of `{% block content %}` with:

```html
  <h1>{{ car }}</h1>
  {{ car_data|json_script:"car-data" }}
  {% if selected_option_ids %}
    {{ selected_option_ids|json_script:"selected-options" }}
  {% endif %}
  <div class="customizer-layout">
    <div id="viewer"></div>
    <aside id="options-panel"></aside>
  </div>
  <script type="module" src="{% static 'cars/js/viewer.js' %}"></script>
```

The save button is deliberately *not* hardcoded here: `buildOptionsPanel()` (Task 8) calls `panel.innerHTML = ""` and rebuilds `#options-panel` from scratch every time an option is applied, which would wipe out a hardcoded button. Instead, `viewer.js` appends the save button itself once, right after building the panel — done in Step 5 below.

- [ ] **Step 5: Wire the save button and auto-apply a reopened build in `viewer.js`**

Add near the top of `cars/static/cars/js/viewer.js`, after `const selectedOptionIds = new Set();`:

```javascript
const savedSelectionEl = document.getElementById("selected-options");
const preselectedOptionIds = savedSelectionEl ? JSON.parse(savedSelectionEl.textContent) : [];
```

At the end of `buildOptionsPanel()`, before its closing brace, add a save button (only if the customizer page says the user is logged in — pass that flag through `carData` instead of checking the DOM, since Task 6's view already has `request.user` available):

```javascript
  if (carData.isAuthenticated) {
    const saveBtn = document.createElement("button");
    saveBtn.id = "save-build-btn";
    saveBtn.textContent = "Save my build";
    saveBtn.addEventListener("click", saveCurrentBuild);
    panel.appendChild(saveBtn);

    const status = document.createElement("p");
    status.id = "save-status";
    panel.appendChild(status);
  }
```

Add the save function near `getSelectedOptionIds`:

```javascript
async function saveCurrentBuild() {
  const status = document.getElementById("save-status");
  status.textContent = "Saving...";

  const response = await fetch("/garage/save/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ car_id: carData.carId, option_ids: getSelectedOptionIds() }),
  });

  status.textContent = response.ok ? "Saved!" : "Couldn't save — please try again.";
}
```

In the `GLTFLoader().load(...)` success callback, after `buildOptionsPanel();`, add:

```javascript
preselectedOptionIds.forEach((id) => {
  const option = carData.options.find((o) => o.id === id);
  if (option) applyOption(option);
});
```

Finally, `carData` needs `carId` and `isAuthenticated` — update `cars/views.py`'s `car_customizer` to add them to `car_data`:

```python
    car_data = {
        "modelUrl": car.model_file.url,
        "options": options,
        "carId": car.id,
        "isAuthenticated": request.user.is_authenticated,
    }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
.venv/Scripts/python manage.py test
```

Expected: `OK` (all tests across all apps pass).

- [ ] **Step 7: Manually verify in the browser**

Log in, open a car's customizer, pick some options, click "Save my build" — status should show "Saved!". Go to "My Garage," confirm the build is listed, click "Open" — the customizer should reload with the same options already applied (swatches/buttons show as selected, car appears in that colour/configuration).

- [ ] **Step 8: Commit**

```bash
git add cars garage
git commit -m "feat: wire up save-build button and reopening a saved build"
```

---

### Task 11: Final Integration Pass

**Files:**
- Modify: `templates/base.html` (nav links), `cars/templates/cars/gallery.html` (link to customizer)
- Create: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: a clickable, navigable full journey (gallery → customizer → save → my garage → reopen), and a `README.md` with setup/run instructions for anyone (including you, months from now) picking the project back up.

- [ ] **Step 1: Link gallery cards to the customizer**

`cars/templates/cars/gallery.html` — wrap each card's heading in a link:

```html
        <h2><a href="{% url 'car_customizer' car.id %}">{{ car }}</a></h2>
```

- [ ] **Step 2: Write the README**

`README.md`:

```markdown
# AutoCraft 3D

Interactive 3D car customization website (Django + Three.js). Final-year BCA project — Phase 1 (car catalog, 3D customizer, accounts, saved builds).

## Setup

    python -m venv .venv
    .venv/Scripts/pip install -r requirements.txt
    .venv/Scripts/python manage.py migrate
    .venv/Scripts/python manage.py createsuperuser
    .venv/Scripts/python manage.py runserver

Visit `http://127.0.0.1:8000/admin/` to add cars and customization options,
then `http://127.0.0.1:8000/` to browse and customize them.

## Running tests

    .venv/Scripts/python manage.py test

## Adding a new car

See `docs/superpowers/plans/2026-08-12-3d-car-customizer.md`, Task 5, for how
to prepare a `.glb` with separable meshes and register it via the admin.
```

- [ ] **Step 3: Full manual walkthrough**

```bash
.venv/Scripts/python manage.py runserver
```

Checklist (as an anonymous visitor, then logged in):
1. Home page lists all cars.
2. Clicking a car opens its customizer; 3D model loads and orbits.
3. All preset view buttons work.
4. Every customization option type present on that car changes the model live.
5. As an anonymous user, the panel prompts login instead of showing a save button.
6. Register a new account, log in.
7. Customize a car, click "Save my build" — see "Saved!".
8. Go to "My Garage" — the build is listed.
9. Click "Open" — customizer reloads with the same options pre-applied.
10. Log out — nav shows "Log in"/"Register" again.

- [ ] **Step 4: Run the full test suite one last time**

```bash
.venv/Scripts/python manage.py test
```

Expected: `OK`, all tests across `cars`, `accounts`, `garage` pass.

- [ ] **Step 5: Commit**

```bash
git add README.md cars/templates/cars/gallery.html
git commit -m "chore: link gallery to customizer, add README"
```

---

## What's Deliberately Not Here (Future Work)

- Service booking module — separate spec/plan (Phase 2).
- Deployment/hosting beyond `runserver` — revisit once Phase 1 + 2 work locally.
- Automated testing of the Three.js viewer — verified manually per task, per the design spec.
