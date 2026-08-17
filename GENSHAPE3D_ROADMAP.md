# GenShape3D Roadmap

## What you are building

Turn GenShape3D into a personal scene creator. The first useful result is not automatic segmentation or automatic rigging. It is a small scene editor where you can place your existing 3D objects, light them, choose a camera, and export images for presentations.

After that, improve the same reusable assets with material maps, segmentation, and rigging. Each improvement creates a new asset version so experiments never destroy the original model or an existing scene.

## The order to follow

Scene basics → presentation output → PBR maps → manual material zones → semantic segmentation → rigging → advanced scenes

This order lets you make useful presentation scenes immediately. Segmentation and rigging become upgrades to assets that already work inside scenes.

## First useful target — approximately 1–2 weeks

Build one page named Scenes where you can:

- Add several existing GenShape3D GLB models.
- Select an object and move, rotate, or scale it.
- Duplicate or remove an object.
- Add a floor, shadows, a directional light, and an HDRI environment.
- Save the arrangement as scene JSON and open it again.
- Save camera views.
- Export a high-resolution PNG with a background or transparency.

Do not extend the current single-object MeshViewer for this. Create a separate SceneEditor. MeshViewer automatically recenters and rescales a model for inspection; doing that inside a scene would destroy the position and relative size of every object.

## Iteration 0 — Safe asset foundations

Effort: 2–3 days.

Why this comes first: Texturing, segmentation, retopology, and rigging all modify an asset. If they overwrite the generated GLB, a failed experiment can damage the original and break scenes that use it.

Build:

- Treat every generated GLB as immutable.
- Create an asset version whenever a mesh is textured, segmented, retopologized, or rigged.
- Give every version an artifact manifest listing its mesh, textures, thumbnails, masks, and metadata.
- Make a scene reference an exact asset version rather than only an asset group.
- Choose a few fixed test models that will be used to verify every processing and export step.

Result: Every later feature is reversible. Old scenes continue using the exact model they were created with.

Likely issue: Asset groups currently organize related generations, but they are not immutable asset versions and they are not scenes.

## Iteration 1 — Scene MVP

Effort: 5–8 days.

Build:

- Create a separate SceneEditor route under the Scenes namespace.
- Load multiple GLBs without automatically recentering or resizing them.
- Represent every placed object as a scene node with an assetVersionId, translation, rotation, and scale.
- Add selection, transform gizmos, duplicate, and delete.
- Add a small outliner so objects can be selected by name.
- Add a ground plane, directional light, ambient or environment light, and shadows.
- Save and load the scene document.

Result: You can compose existing objects into a simple scene immediately.

Likely issues:

- Generated models may use inconsistent real-world scale or face different directions.
- Large GLBs can exhaust browser memory when several are loaded.
- Transparent materials and shadows may need per-model correction.
- A scene must transform an instance, never rewrite the source GLB.

## Iteration 2 — Presentation output

Effort: 3–5 days.

Build:

- Add camera presets and saved camera views.
- Add neutral studio, dramatic, and outdoor HDRI/environment presets.
- Add background color, image background, and transparent background options.
- Add reliable high-resolution PNG capture.
- Add simple lighting presets and shadow-quality settings.
- Later, export the composed scene as GLB where its materials are portable.

Result: You can create polished images for presentations before advanced AI features exist.

Likely issues:

- A render that looks good in the viewport may change at export resolution.
- Tone mapping, exposure, and color management must be consistent.
- Browser canvas and GPU limits can affect very large exports.
- Height/displacement and some custom material features do not export portably in core glTF.

## Iteration 3 — PBR material maps

Effort: 1–2 weeks.

First build a material inspector. It should load imported maps, show each map by itself, adjust strengths, and test the material under neutral HDRI lighting. This gives you a reliable way to judge generated maps later.

Support these maps:

- Base color or albedo: The visible surface color without baked shadows or reflections. It uses sRGB color space.
- Roughness: Controls whether reflections are sharp or diffuse. Black is smooth; white is rough. It is linear/non-color data.
- Metallic: Identifies metal versus non-metal. It is normally close to white for metal and black for dielectric materials. It is linear/non-color data.
- Normal: Stores RGB surface directions and changes per-pixel lighting without changing the silhouette. It is linear/non-color data.
- Ambient occlusion: Darkens indirect light in small crevices. It is linear/non-color data.
- Emissive: Defines areas that appear to produce light or illuminated color. It uses sRGB.
- Opacity: Defines cutout or blended transparency.
- Height or bump: A grayscale height field interpreted by the shader. It changes apparent detail, not geometry or silhouette.
- Displacement: Moves real vertices using a height field. It changes geometry but needs enough mesh subdivisions.

Use the metallic/roughness PBR workflow because it maps naturally to Three.js, glTF, Blender, Unreal, and Unity. For glTF packing, roughness uses the green channel and metallic uses the blue channel. Core glTF supports base color, metallic/roughness, tangent-space normal, ambient occlusion, and emissive. Height/displacement should remain an authoring artifact unless a target engine explicitly supports it.

Generate maps in three ways:

- Geometry baking: Bake high-poly detail to low-poly normal maps, AO, curvature, thickness, position, object-space normals, and sometimes height.
- AI material inference: Use a mesh plus reference image to predict and bake material appearance from multiple rendered views into UV space.
- Procedural derivation: Create preview/fallback normal from height, roughness variation, binary metallic masks, grain, scratches, weave, or pores.

Recommended processing order:

Mesh validation → normal repair → retopology/decimation if needed → UV unwrap → material segmentation → reference image → multi-view material inference → UV bake → geometry normal/AO bake → seam padding → HDRI validation → glTF packing

For Hunyuan3D-Paint, remember:

- The official workflow needs both a mesh and a reference image.
- Prompt-only texturing therefore needs an intermediate generated reference image.
- Model inference commonly works internally around 512/768 pixels across multiple views; a requested 2K or 4K result is a final bake/upscale target, not proof of native 4K detail.
- The RTX 3090 is the correct worker target because texture inference can approach its VRAM capacity.
- The worker must report exactly which maps it produced. The UI must not claim that a normal or roughness map exists when the provider only returned color.

Likely issues:

- Missing, overlapping, or stretched UVs cause texture distortion.
- UV seams appear when view projection and padding are poor.
- Wrong color-space settings make normal, roughness, and metallic maps behave incorrectly.
- A normal map may use the opposite green-channel convention from the renderer.
- Baked lighting in albedo looks wrong when scene lighting changes.
- GPU memory can fail on complex meshes, many views, or high resolutions.

## Iteration 4 — Manual material segmentation

Effort: 1–2 weeks.

Start with material zones, not separated geometry. A material zone lets one model have wood, metal, fabric, skin, or glass regions. It provides immediate value and does not require generating hidden surfaces.

The current GenShape3D selector performs geometry-based region growing: it raycasts one triangle, finds adjacent triangles, expands for a limited number of steps, and rejects triangles whose normal differs too much from the original seed. This is useful as an assisted selection tool, but it does not understand semantic parts.

Build:

- Keep click/region growing as one selection mode.
- Add connected-component selection for physically disconnected pieces.
- Add a real brush with add and remove modes.
- Make feathering store soft mask weights rather than only displaying a value.
- Add merge, split, rename, hide, and isolate actions.
- Assign a material to each saved zone.
- Save zone membership on the exact asset version.
- Prefer a stored face-label attribute or UV-space mask over temporary runtime mesh identifiers.

Result: You can make a wooden object with a metal handle, separate clothing materials, or isolate glass without requiring automatic AI segmentation.

Likely issues:

- Face indices change after decimation, retopology, or mesh replacement.
- Comparing every triangle only with the original seed normal stops too early on curved surfaces.
- Fused geometry can make a region bleed into a neighboring semantic part.
- Splitting visible triangles into a new object does not create the hidden internal surface.

## Iteration 5 — Semantic and part segmentation

Effort: 2–4 weeks for a useful provider-assisted version; advanced part completion can take much longer.

Remember the three meanings:

- Image segmentation: Separates the subject from the input-image background. GenShape3D already uses this before generation.
- Surface or material segmentation: Labels mesh triangles or texture pixels as regions such as metal, wood, shirt, or skin.
- Part segmentation: Creates meaningful editable parts such as head, torso, arm, wheel, blade, or handle.

Tripo-style segmentation combines geometric boundaries with semantic/visual understanding. A likely workflow renders multiple views, proposes semantic regions in the images, transfers consistent labels back to mesh faces, and cleans boundaries using connectivity and geometry. Tripo’s exact production architecture is not public.

Part completion is a separate problem. Cutting out the visible triangles of an arm or wheel produces an open, incomplete shell. A complete independent part needs newly generated geometry for the surfaces that were hidden inside the combined mesh.

Build:

- Put semantic segmentation behind a provider adapter so Tripo or another provider can be replaced later.
- Return named regions with confidence, connectivity, and face or mask membership.
- Let the user merge, split, rename, and brush-correct every automatic result.
- Save the result as structure belonging to one immutable asset version.
- Recompute or deliberately transfer regions whenever topology changes.
- Treat complete part generation as a later feature, separate from material segmentation.

Result: Select all wheels, identify character limbs, and reuse meaningful parts.

Likely issues:

- Automatic labels can be inconsistent across views.
- Boundaries can cross fused geometry or produce many tiny fragments.
- Semantic names may be wrong even when geometric boundaries look correct.
- The original model may contain no hidden surfaces to complete a separated part.
- Provider output may change, so manual correction and saved versions are essential.

## Iteration 6 — Rigging

Effort: 2–4 weeks for imported rigs plus a basic humanoid workflow. Arbitrary creatures, mechanical rigs, and robust automatic skinning can require months.

Rigging has separate layers:

- Skeleton: A hierarchy of bones and joints.
- Skin weights: How strongly every vertex follows each bone.
- Controls or posing: A usable way to rotate and position the rig.
- Animation: Keyframes or clips that change the skeleton over time.

Segmentation can help identify arms, legs, torso, or mechanical pieces, but it does not automatically create a good skeleton or good skin weights. Deformation quality depends heavily on topology around shoulders, elbows, hips, knees, and fingers.

Build in this order:

- Load already-rigged GLBs without losing skeletons, skins, or animation clips.
- Add animation playback and clip selection inside the viewer and scene editor.
- Add skeleton visualization and simple posing.
- Add a humanoid auto-rig provider or workflow.
- Store the rigged mesh, skeleton, weights, and animations as a new asset version.
- Add manual weight correction only when the initial workflow proves useful.
- Leave arbitrary-object rigging until the humanoid path is reliable.

Result: Use posed characters and existing animations in scenes before solving universal auto-rigging.

Likely issues:

- Generated topology may collapse or stretch around joints.
- A model’s neutral pose may be unsuitable for auto-rigging.
- Retopology can be required before skinning.
- Bone naming and coordinate conventions differ between tools and engines.
- Animation retargeting requires compatible humanoid bone mapping and rest poses.

## Iteration 7 — Scene editor version 2

Effort: 1–2 weeks after the MVP, then ongoing improvements.

Build:

- Parent/child hierarchy and grouped transforms.
- Translation, rotation, and scale snapping.
- Reusable prefabs or scene fragments.
- Per-instance material overrides without modifying the asset.
- Cameras, lights, and environments in the outliner.
- Undo and redo.
- Autosave and scene versions.
- GLB export where portable, followed later by engine-specific export profiles.

Result: GenShape3D becomes a reusable scene-authoring tool rather than a one-off presentation composer.

Likely issues:

- Undo/redo must cover object, material, hierarchy, and asset-version changes.
- Updating an asset version must not silently change old scenes.
- Some renderer features cannot be represented in portable GLB.
- Large scenes need loading, memory, and draw-call optimization.

## Scene data you need to preserve

An asset is the reusable chair. A scene node is one particular chair placed at a particular position. Moving or recoloring that node must not modify the reusable chair.

A scene document stores:

- Scene identifier, name, and version.
- Units and coordinate convention.
- Environment, background, and exposure.
- Nodes with id, name, parentId, assetVersionId, translation, rotation, scale, visibility, and optional material overrides.
- Lights and their transforms/settings.
- Cameras and saved views.
- Export settings.

## Current GenShape3D gaps to remember

- GenShape3D has asset groups but no persistent scene graph.
- The existing viewer is for one automatically framed model, not persistent scene layout.
- Texture source mode and face zones are sent by the client but are not fully persisted by the server.
- The texture reference-image control records a filename but does not yet complete the upload/attachment workflow.
- A texture job stores one result URL instead of an artifact for every returned map and variant.
- Texture workers need authenticated capability routing so heavy jobs reach the RTX 3090.
- The viewer needs HDRI/PMREM lighting and solo-map inspection before generated PBR can be judged reliably.
- Current saved zones depend on face indices and can become invalid after geometry changes.

## Realistic total effort

- Presentation-ready Scene MVP: 1–2 weeks.
- Scene MVP plus dependable PBR viewing and manual material zones: 3–5 weeks.
- Automatic segmentation and basic humanoid rigging: roughly 6–10 weeks total.
- Robust arbitrary-character rigging and Tripo-level complete parts: potentially several additional months.

## Decisions not to forget

- Start producing scenes before segmentation and rigging are complete.
- Never overwrite original assets.
- Keep scenes separate from assets and bind scene nodes to exact asset versions.
- Start maps with a trustworthy inspector and imported maps, then add AI generation.
- Start segmentation with editable material zones, then semantic regions, then complete parts.
- Start rigging with imported rigs and humanoids, not arbitrary objects.
- Keep manual correction after every AI operation.
- Reserve the Scenes namespace for the real scene creator; Roadmap remains the durable guide.
