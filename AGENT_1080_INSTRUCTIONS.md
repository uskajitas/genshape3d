# 1080 Server Instructions

This file clarifies what the current Texture work means for the 1080 server.

## Current Role

The 1080 server should continue to handle the existing Hunyuan image-to-3D flow.

For now, treat Texture as a frontend and control-plane feature that is being prepared for a proper texture pipeline. Do not assume the 1080 can run the new PBR texture workflow.

## Important Constraint

The 1080 supports Hunyuan mesh generation only.

It should not be assigned jobs that require:
- PBR texture generation.
- Material map generation.
- Existing GLB retexturing.
- Region-based texture zones.
- Multi-map outputs such as base color, roughness, normal, or metallic maps.

Those jobs are expected to target the 3090-capable path when the backend worker implementation is added.

## Texture Feature Implications

The frontend now allows users to:
- Pick an existing finished model.
- Click/select regions on the mesh.
- Save texture zones as face-index selections.
- Send texture settings and zones with a future texture job payload.

This does not mean the 1080 should process those zones.

The zone data is intended for a future texture-capable worker that can apply materials or generated texture maps to an existing mesh. The 1080 path should ignore this feature unless explicitly updated later.

## Routing Expectation

When texture jobs become real backend jobs:

- 1080: image-to-3D mesh generation with supported Hunyuan options.
- 3090: texture/PBR/retexture jobs, including region or zone-guided texture work.

If a job asks for a texture-only operation on an existing GLB, the 1080 should not claim it.

## What Not To Do

Do not add a partial texture implementation on the 1080 by rerunning image-to-3D.

That is not the intended Texture workflow. Image-to-3D already covers full regeneration. Texture is meant to work on an existing mesh and preserve the shape.

Do not silently drop texture zones or material map requests and still mark the job as successful. If the 1080 receives an unsupported texture job, it should fail clearly or refuse to claim it once routing supports that distinction.

## Future Backend Requirement

The backend should distinguish mesh-generation jobs from texture jobs clearly enough that workers can advertise capabilities and only claim compatible work.

At minimum, the system needs a capability split similar to:

- `mesh:hunyuan`
- `texture:hunyuan`
- `texture:pbr`
- `texture:zones`

The exact naming can change, but the separation matters. The 1080 should not be treated as a generic texture worker.

