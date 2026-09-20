# Demo car assets

The five demo cars (Sedan, Sports Sedan, SUV, Sports Hatchback, Future Racer) and the three
alternate wheel designs come from the **Car Kit (v3.1) by Kenney** (www.kenney.nl),
released under **CC0** (public domain). See `KENNEY_LICENSE.txt`.

Changes made for this project:

- Only the models used here were kept (`models/`).
- The models point to an external `colormap.png`; that palette image is now embedded inside each
  `.glb` so a model works on its own when uploaded through the admin panel.
- `thumbnails/` are side-view pictures captured from the running site.
- `textures/racing_stripes.png` was generated for the racing-stripe decal.

Load them into the database with:

    .venv\Scripts\python manage.py seed_demo_cars

The command is safe to run again: it updates the cars and options in place, so saved builds keep working.

## How these models are customized

They have no interior and no exhaust parts, so:

- **Paint** recolors only the body's swatch in the shared palette image (`Car.paint_mode = palette`,
  `Car.paint_region` = that swatch's x,y,width,height in pixels).
- **Wheels** swap the four wheel meshes for the shape in an option's `part_file`.
- **Exhaust** tips are generated in code (`mesh_name` starting with `generated:`).
- **Decals** are projected onto the body from above, so they follow its shape.
- **Interior** is not available on these cars; a car only shows the option types it has.
