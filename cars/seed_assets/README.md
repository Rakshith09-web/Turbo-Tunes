# Demo car assets

**⚠️ These are temporary/demo assets, not cleared for public or commercial use.** Four of the
five current models are real, currently-sold manufacturer cars, sourced from Sketchfab. Three of
those four carry a **non-commercial** license, and the fourth (the F1 car) wears a real,
current sponsor livery that its own CC license doesn't clear the rights to. This set was chosen
deliberately, as an explicit interim step, to record a demo before swapping in unbranded
replacements — see the licensing notes below before deploying this anywhere public, putting it
in a portfolio, or using it commercially.

## The five cars

| Car (in AutoCraft) | Real model | Author | License | Commercial use? |
|---|---|---|---|---|
| Sedan | 2025 BMW M5 Sedan | Ddiaz Design | CC-BY-**NC**-SA-4.0 | ❌ No |
| Sports Sedan | 2025 Porsche Taycan Turbo GT Weissach | Ddiaz Design | CC-BY-**NC**-SA-4.0 | ❌ No |
| SUV | MMC Generic Small SUV Car (unbranded) | MMC Works | CC-BY-4.0 | ✅ Yes |
| Sports Hatchback | 2023 Mercedes-AMG A45 S 4Matic | Ddiaz Design | CC-BY-**NC**-SA-4.0 | ❌ No |
| Future Racer | Aston Martin F1 AMR23 2023 | Redgrund | CC-BY-4.0 (model only) | ⚠️ Model yes, livery no — the paint texture carries real, current sponsor trademarks (Aramco, Cognizant, Pirelli, TeamViewer, Bombardier, Lenovo, and others); a CC license on the 3D scan does not grant any rights to those brands' marks. |

Full attribution text and source links for each are in `LICENSE_CREDITS.txt` in this directory —
required reading (and required crediting, per each license) before sharing this project outside
of coursework.

**Before any public/commercial use**, replace the Sedan, Sports Sedan, Sports Hatchback and
Future Racer with unbranded equivalents (the SUV is already fine as-is). See the chat history
for a shortlist of vetted CC-BY, unbranded replacements already found on Sketchfab.

## How these models were processed

Each was downloaded from Sketchfab in glTF format, then, using `glTF-Transform`:

- Packed from separate `scene.gltf` + `.bin` + textures into a single `.glb`.
- Three of the five (Sedan, Sports Sedan, Sports Hatchback) needed a **100x uniform scale
  correction** — their raw glTF export was ~100x too small (a unit-conversion quirk in the
  source export pipeline), which breaks every bit of this project's bounding-box-based code
  (camera framing, generated exhaust placement, decal projection). Verified by test-rendering
  before and after.
- Textures downscaled to 1024px and re-encoded as WebP; geometry simplified to ~55% of source
  vertex count. Typical result: 15–55 MB source → 5–17 MB shipped `.glb`.
- `optimize`'s default `join` step merges same-material meshes together, which incidentally
  collapsed the Sports Hatchback's many individually-named body panels (doors, hood, bumpers,
  fenders, roof, mirrors, side skirts — originally ~18 separate meshes sharing one paint
  material) into a single paintable mesh.

## How these models are customized

Unlike the old Kenney set, these keep their own baked-in materials rather than sharing one
palette image, so:

- **Paint** (`Car.paint_mode = tint`) directly recolors one named mesh per car — the mesh
  covering the visible body panels, found by trial rendering with a bright highlight colour
  and checking the result. See `paint_mesh` in `seed_demo_cars.py` for the exact name per car.
  On the Future Racer, this mesh is the *entire* single-piece model (tires and glass included,
  since `optimize`'s join step merged everything), so repainting it is visible but subtle —
  multiplying a texture that's mostly dark livery by a paint colour doesn't shift much.
- **Exhaust** tips are still generated in code (`mesh_name` starting with `generated:`) from the
  car's bounding box, so they work unchanged regardless of the underlying model.
- **Wheels and decals are not seeded for this set.** The Kenney models' wheel-swap and decal
  projection relied on consistent part naming and a simple body mesh that these scanned models
  don't have (no matching alternate wheel geometry, and decal projection onto one mesh of a
  many-panel car wouldn't cover the whole body). The customizer already only shows the option
  types a car actually has, so this isn't a broken UI — those tabs just don't appear.
- **Interior** is not seeded either, though these models (unlike the Kenney set) do have real
  interior geometry — adding it is a reasonable follow-up, just not done in this pass.

Thumbnails in `thumbnails/` are side-view captures from the running customizer (`?capture` query
param, right-side preset view), same approach as before.

Load everything into the database with:

    .venv\Scripts\python manage.py seed_demo_cars

The command is safe to run again: it updates the cars and options in place (and clears any
stale wheels/decal options from an older seeding), so saved builds keep working.
