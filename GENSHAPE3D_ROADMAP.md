GENSHAPE3D ROADMAP
Conversation record — 17 August 2026

PURPOSE

Turn GenShape3D from an object generator into a personal scene creator whose assets can be reused in presentations and other projects.

The immediate goal is not a full Blender replacement. It is to place existing GenShape3D objects into simple, attractive scenes as soon as possible, then improve those assets through PBR materials, segmentation and rigging.


RECOMMENDED ORDER

0. Safe foundations — 2–3 days

- Keep every generated GLB immutable.
- Texture, segmentation, retopology and rigging create new asset versions.
- Store produced files in an artifact manifest.
- Make scenes reference an exact asset version.
- Establish several fixed test assets and export checks.

Main issue: overwriting source models makes later experiments difficult to undo.


1. Scene basics — 5–8 days

- Create a SceneEditor separate from the current single-object MeshViewer.
- Load multiple GLB assets.
- Move, rotate, scale, duplicate and remove scene instances.
- Add a simple object outliner.
- Add a ground plane, shadows, basic lighting and an environment.
- Save and restore a scene document.

Usable result: compose existing objects into simple scenes immediately.

Main issue: MeshViewer currently recenters and rescales models, which must not happen to scene instances.


2. Presentation output — 3–5 days

- Camera presets.
- Neutral and styled HDRI environments.
- Background color or transparent background.
- High-resolution PNG capture.
- Consistent framing and lighting presets.

Usable result: images ready to place in presentations for other projects.

Main issue: browser rendering, shadows and color management must be checked at final presentation resolution.


3. PBR materials and maps — 1–2 weeks

Core maps:

- Base color / albedo: surface color without baked lighting. Use sRGB.
- Roughness: black is smooth, white is rough. Use non-color data.
- Metallic: normally black for non-metals and white for metals. Use non-color data.
- Normal: changes the per-pixel lighting direction without changing the silhouette.
- Ambient occlusion: reduces indirect light in crevices.
- Emissive: areas that appear to produce light.
- Opacity: cutout or transparent regions.
- Height / bump: grayscale apparent depth; it does not move geometry.
- Displacement: moves real vertices and requires sufficient mesh subdivision.

Implementation:

- Add HDRI lighting and a material/map inspector to the viewer.
- Validate UVs and color spaces.
- Support imported maps before relying on generated maps.
- Connect Hunyuan3D-Paint on the RTX 3090 for reference-image PBR generation.
- Treat 1K, 2K and 4K as final baked/upscaled output sizes.
- Record exactly which maps each provider actually produced.
- Package portable output using glTF metallic/roughness conventions.

Main issues: bad UVs, visible seams, baked lighting in albedo, incorrect normal orientation, misleading upscale resolution and GPU memory limits.


4. Manual material segmentation — 1–2 weeks

- Improve the existing face-region grow tool.
- Add connected-component selection.
- Add real brush add/remove behavior.
- Support merge, split, rename and material assignment.
- Store regions against an immutable asset version.
- Prefer durable face labels or UV-space masks over temporary mesh UUIDs.

Usable result: assign metal, wood, fabric or other materials to different areas of one model.

Main issue: raw triangle indices become invalid after retopology or decimation.


5. Semantic segmentation — 2–4 weeks

Segmentation has three separate meanings:

- Image segmentation removes the background from an input image. GenShape3D already does this.
- Surface/material segmentation labels areas of a mesh for different materials.
- Part segmentation separates meaningful objects such as arms, wheels or chair legs.

Tripo’s public workflow combines geometry and semantic understanding, offers different granularities, transfers labels to mesh parts and allows manual correction. Part completion is a separate operation because visible surface cuts do not contain hidden internal geometry.

Implementation:

- Keep manual correction available at all times.
- Put semantic segmentation behind a provider adapter.
- First evaluate Tripo segmentation for fast results.
- Later evaluate local surface segmentation and HoloPart-style completion if needed.
- Store semantic names, connectivity and region membership as reusable asset structure.

Main issues: fused geometry, incorrect boundaries, unnamed fragments and missing hidden surfaces.


6. Basic rigging — 2–4 weeks

- First load and correctly display already-rigged GLBs.
- Add skeleton visualization and animation playback.
- Add posing controls.
- Introduce a humanoid auto-rig workflow after playback is reliable.
- Store the rigged result as a new asset version.
- Leave arbitrary creatures and mechanical rigs outside the first scope.

Usable result: posed humanoid assets and imported animations inside scenes.

Main issues: generated topology deforms badly around joints, segmentation does not automatically create good skin weights, and some models require retopology first.


7. Scene editor v2 — 1–2 weeks

- Parent/child hierarchy.
- Transform snapping.
- Reusable prefabs.
- Per-instance material overrides.
- Cameras, lights and environments in the outliner.
- Undo and redo.
- GLB scene export where portable.
- Engine-oriented export profiles later.

Usable result: a reusable scene-authoring tool rather than a one-off presentation composer.

Main issues: asset-version changes, undo/redo design, portable material features and export compatibility.


SCENE DATA MODEL

An asset is a reusable object. A scene node is one placed instance of that object.

A scene stores:

- Scene name and version.
- Units and coordinate convention.
- Environment and background.
- Nodes with parent, assetVersionId, translation, rotation and scale.
- Optional per-instance material overrides.
- Lights.
- Cameras.
- Export settings.

Moving or recoloring one scene instance must never modify the original asset.


CURRENT GENSHAPE3D STATE

- React, TypeScript, Three.js and an Express/Postgres backend.
- Image-to-3D and multi-view generation workflows.
- GLB asset preview.
- Asset groups, but no persistent scene graph.
- A dedicated texture-job table and early texture UI.
- PBR map options in the UI.
- A geometric face-selection prototype with saved zones in client state.
- RTX 3090 and GTX 1080 worker distinction.

Important gaps:

- Texture source mode and face zones are sent by the client but not persisted end-to-end.
- Reference texture images are not yet uploaded by that workflow.
- Texture jobs expose one result URL rather than individual map artifacts.
- Texture worker capability routing needs to be enforced.
- The viewer lacks an HDRI material-inspection environment.
- Asset groups organize results but are not scenes.


TIMELINE

- Presentation-ready Scene MVP: approximately 1–2 weeks.
- Scene MVP plus reliable PBR viewing and manual material zones: approximately 3–5 weeks.
- Automatic segmentation and basic humanoid rigging: approximately 6–10 weeks total.
- Robust arbitrary-character rigging and complete semantic part generation may require several additional months.


DECISIONS TO PRESERVE

- Start seeing useful scenes before advanced segmentation and rigging are finished.
- Keep every operation reversible through asset versions.
- Keep scenes separate from source assets.
- Keep manual correction alongside every AI operation.
- Do not pretend a provider generated a map it did not produce.
- Test PBR materials under proper environment lighting.
- Begin rigging with already-rigged GLBs and humanoids.
- Reserve the Scenes section for actual scene creation.
- Use the Roadmap section only as the durable record of this plan.
