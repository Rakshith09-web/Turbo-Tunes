# AutoCraft 3D — Phase 1 Design: 3D Car Customizer

Status: Approved
Date: 2026-08-12
Scope: Phase 1 only (car catalog + 3D customizer + user accounts + saved builds). Service booking is Phase 2, specified separately.

## Purpose

A final-year BCA project: a website where a user picks a car, views it in real-time interactive 3D from any angle (including preset Front/Rear/Left/Right/Top/Bottom views), and customizes its paint colour, wheels, decals, interior colour, and exhaust live in the browser. Customized builds are saved to a user account. A later phase adds a service-booking module tied to saved builds.

The user is a complete beginner in web development (HTML/CSS/JS) currently learning Python, with a full semester available. The design deliberately minimizes JS surface area and leans on Django's built-ins to avoid reinventing auth/admin.

## Tech Stack

| Piece | Choice | Why |
|---|---|---|
| Backend | Python + Django | Built-in auth, ORM, and admin panel remove the most tedious plumbing for a beginner; Python-first matches the learning goal. |
| Database | SQLite (dev) | Zero-config, ships with Django; swappable to PostgreSQL later via config only. |
| 3D rendering | Three.js (JavaScript) | The only way to do real-time interactive WebGL 3D in a browser — Python cannot run client-side. Kept isolated to one well-explained file. |
| 3D model format | glTF/.glb | Web-3D standard; loads natively via Three.js's `GLTFLoader`. |
| Pages | Django templates + CSS | Server-rendered HTML is simpler to reason about than a JS framework, appropriate for a beginner. |
| Auth | Django's built-in auth | Login/registration/session handling, already secure — no reason to hand-roll as a beginner. |

## Components (Django apps)

- **`cars` app**
  - `Car`: name, brand, description, thumbnail image, `.glb` file path.
  - `CustomizationOption`: FK to `Car`, `option_type` (paint / wheels / decal / interior / exhaust), label, and either a colour value, texture reference, or target mesh-name(s) to toggle/swap.
  - Registered in Django admin so staff can add cars/options without new code.
- **`garage` app**
  - `SavedBuild`: FK to `User`, FK to `Car`, chosen `CustomizationOption` IDs (one per option type), timestamps.
  - Powers the "My Garage" page (list + reopen a saved build).
- **`accounts`**
  - Django's built-in `User` model.
  - `Profile`: FK to `User`, phone number, default address (used later by Phase 2 booking).
- **3D viewer (frontend, one JS module)**
  - Loads the selected car's `.glb` via `GLTFLoader`.
  - `OrbitControls` for free drag-to-rotate; six preset-view buttons animate the camera to Front/Rear/Left/Right/Top/Bottom.
  - Side panel built from the car's `CustomizationOption` JSON (passed from the Django view into the page): clicking an option live-updates the corresponding mesh's material (paint/interior colour), swaps mesh visibility (wheels/exhaust variants), or applies a decal texture to the body's UV map.
  - All customization preview happens client-side only — no server round-trip while playing with options, so it feels instant.

## Asset Sourcing Constraint

To make paint/wheels/interior/exhaust independently changeable, each car's `.glb` needs those parts as separate named meshes, not one fused mesh. Free models vary in how well they're separated. Approach:
- Pick each of the 3–5 catalog cars based on what's actually separable in the source model (prioritize body/wheel/glass separation).
- Decals are applied as textures on the body's UV map, which works regardless of mesh separation.
- For parts not naturally separate on a given model (e.g. exhaust tips), attach a small generic swappable piece rather than depending on the source model having one.

## Data Flow

1. **Homepage → Car Gallery**: Django view queries `Car` table, renders a grid of thumbnails.
2. **Select a car → Customizer page**: Django view serializes that car's `CustomizationOption`s as JSON into the page. JS initializes the Three.js scene, loads the `.glb`, sets up orbit + preset-view controls, and builds the option panel from the JSON.
3. **"Save my build"**: JS sends chosen option IDs via `fetch` to a Django endpoint → saved as a `SavedBuild` row tied to the logged-in user (requires login).
4. **"My Garage"**: lists a user's saved builds; reopening one reloads the customizer with those exact options pre-applied.
5. *(Phase 2, future spec)* From a saved build → "Request Service" flow, specified separately.

## Error Handling

- Forms (registration, save build) validated client-side (fast feedback) and server-side via Django forms (the real guard).
- 3D model loading: show a loading spinner during `.glb` download; on failure, show a friendly error instead of a blank/broken scene.
- Auth-gated pages (My Garage, Save Build) use Django's `login_required`, redirecting anonymous users to login.

## Testing

- Backend: Django's built-in test framework (`unittest`-based) — e.g. anonymous users can't save a build; a saved build links to the correct user and car.
- 3D viewer: inherently visual — tested manually in-browser during development rather than automated, which is not a good time investment at this stage.

## Out of Scope (this phase)

- Service booking (Phase 2, separate spec).
- Real-time multi-user collaboration, payments, technician dispatch/GPS tracking, native mobile apps — none of these are planned for the project at all (see synopsis scope section).
- Hosting/deployment beyond local development (revisit once Phase 1 + 2 are working).
