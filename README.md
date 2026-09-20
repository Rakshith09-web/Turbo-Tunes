# AutoCraft 3D

An interactive 3D car customization website (Django + Three.js). Final-year BCA project.

Visitors open the site and land straight in a 3D showroom. They can rotate the car to any angle, jump to
front/rear/left/right/top/bottom views, and customize paint, interior, wheels, exhaust and decals live.
Logged-in users can save builds to "My Garage" and reopen them later.

## Tech stack

| Piece | Used for |
|---|---|
| Python + Django | Backend: routing, database, login/registration, admin panel |
| SQLite | Database (built into Django, no setup) |
| Three.js (via CDN) | Real-time 3D rendering in the browser |
| Django templates + CSS | Pages and the light minimalist theme |

## Run it (Windows, VS Code terminal)

From the project folder (the one containing `manage.py`):

    .venv\Scripts\python manage.py runserver

Then open http://127.0.0.1:8000/. Stop with `Ctrl+C`.

### First-time setup (only on a fresh copy of the project)

    python -m venv .venv
    .venv\Scripts\pip install -r requirements.txt
    .venv\Scripts\python manage.py migrate
    .venv\Scripts\python manage.py createsuperuser
    .venv\Scripts\python manage.py seed_demo_cars

`seed_demo_cars` loads the five demo cars with all their options. It's safe to run again.

## Pages

| URL | What it is |
|---|---|
| `/` | 3D showroom (the featured car) |
| `/cars/` | All cars |
| `/cars/<id>/` | Customizer for one car |
| `/accounts/register/`, `/accounts/login/` | Sign up and log in |
| `/garage/` | My Garage (saved builds, login required) |
| `/admin/` | Admin panel: add cars and customization options |

## Tests

    .venv\Scripts\python manage.py test

## Project layout

- `cars/` catalog, customizer page and the Three.js viewer (`cars/static/cars/js/viewer.js`)
- `accounts/` registration, login, `Profile`
- `garage/` saved builds
- `templates/`, `static/` shared layout and styling
- `cars/seed_assets/` the demo models, thumbnails and their license
- `docs/` synopsis, design spec, implementation plan and the UI mockup

## Notes

- The demo cars use free CC0 models from the Kenney Car Kit (see `cars/seed_assets/README.md`). They have
  no interior or exhaust parts, so those cars offer paint, wheels, generated exhaust tips and decals.
- To add your own car, upload a `.glb` as the car's "model file" in the admin panel and add its
  customization options there. A car with no model file falls back to a built-in placeholder.
- After editing CSS or JS, hard-refresh the browser (`Ctrl+Shift+R`), since the dev server doesn't send
  cache headers for static files.
- Service booking is not built yet.
