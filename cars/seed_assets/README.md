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
  `tintMesh()` in `viewer.js` strips the mesh's colour map and sets an explicit glossy-paint
  response (metalness 0.55, roughness 0.35) rather than just multiplying `material.color`
  against the baked texture — several of these models have no real metallic-roughness texture
  of their own, so without this they default to glTF's spec fallback (fully metallic, fully
  rough) and render almost black regardless of the colour picked, with no environment map in
  the scene to give a metal surface anything to reflect.
  On the Future Racer, the paint mesh is the *entire* single-piece model (tires and glass
  included, since `optimize`'s join step merged everything and the raw source only ever had
  one material) — repainting it recolors the whole car, wheels included. Investigated whether
  any of its 6 raw mesh chunks could be isolated as "body only": no — each one is a mix of
  body panels, aero parts *and* wheel geometry, not a clean per-part split, so this can't be
  fixed by picking a different mesh. Fixing it for real means manually re-modeling the source
  asset, out of scope here.
- **Wheel colour** recolors one real mesh (or, for the Sports Sedan, 4 identical wheel meshes
  that stayed separate through processing — see `meshesMatchingNames` in `viewer.js` for the
  comma-separated multi-mesh case). Not available on the Future Racer: even in the raw,
  unprocessed download it has no separate wheel geometry at all. On the SUV, the wheel mesh
  also carries the brake calipers/discs (one shared material in the source model), so wheel
  colour tints brakes along with the rims — a minor, accepted trade-off.
- **Spoiler** works one of two ways, per car (see `spoiler_mesh` in `seed_demo_cars.py`):
  - **Generated** (Sedan, Sports Sedan): built in code from the car's bounding box
    (`buildSpoiler()` in `viewer.js`), the same technique as the exhaust tips. Neither model
    has a real, separately-targetable spoiler part — the BMW M5 doesn't have one at all
    (matching the real car), and the Porsche's fixed wing is fused into the same continuous
    "Paint" surface as the rest of the body (checked every other material on the model; none
    of them is a separate wing). The strut mount height is anchored to a fraction of the car's
    total height (`deckY = box.min.y + size.y * 0.58`), not the tallest point of the whole
    car (`box.max.y`, which is the roof peak further forward) — using the roof peak left the
    generated wing floating disconnected above the trunk with a visible gap.
  - **Real geometry** (Sports Hatchback): the A45 has a genuine, separate roof-spoiler node in
    the raw download (`SK_Spoiler_101`), but `optimize`'s default `join` step (which groups by
    shared material) swallowed it into the same mesh as the rest of the body, since it shares
    the body's paint material. Recovered by cloning the spoiler's material with one property
    nudged (`isolate_spoiler_material.mjs`-style: `roughnessFactor += 0.0137`, otherwise
    `optimize`'s `dedup` step — which runs *before* `join` — immediately merges an
    identical-content clone straight back) before running the rest of the pipeline, so `join`
    sees it as a distinct material and leaves it as its own mesh.
- **Decals** project onto each car's own paint mesh from directly above (`applyDecal` in
  `viewer.js`), reusing the same single-mesh target as paint — works on all 5 cars since each
  ended up with exactly one paint mesh after processing.
- **Exhaust** tips are generated in code (`mesh_name` starting with `generated:`) from the
  car's bounding box, so they work unchanged regardless of the underlying model.
- **Interior** is not seeded, though these models (unlike the Kenney set) do have real interior
  geometry — adding it is a reasonable follow-up, just not done in this pass.

Thumbnails in `thumbnails/` are side-view captures from the running customizer (`?capture` query
param, right-side preset view), same approach as before.

Load everything into the database with:

    .venv\Scripts\python manage.py seed_demo_cars

The command is safe to run again: it updates the cars and options in place (and clears any
stale wheels/decal options from an older seeding), so saved builds keep working.
