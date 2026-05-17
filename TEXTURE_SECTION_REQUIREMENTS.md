# GenShape3D Texture Section Requirements

## Goal

Add a real Texture workflow to GenShape3D.

Texture is not Image to 3D with texture enabled. Texture starts from an existing finished 3D model and creates a new textured version of that model.

## User Experience Rule

- Left panel: inputs and decisions
- Center: current preview
- Right rail: asset library, always called My assets

The Texture section must feel like its own workflow, not a copy of Image to 3D.

## Main Workflow

1. User opens Texture.
2. User picks a finished 3D model from their assets.
3. The selected model stays visible in the center preview.
4. User chooses the texture direction.
5. User optionally adds a reference image.
6. User chooses texture settings.
7. User generates a new textured version of the same model.
8. Output appears as a texture result linked to the source model.

## Required Inputs

- Source model
  - Must be a finished 3D model.
  - Must come from the user's existing generated assets.
  - The source model should remain selected while the user changes texture controls.

- Direction
  - Free text prompt describing the desired texture, material, finish, age, wear, color, or style.

- Material preset
  - Auto
  - Ceramic
  - Wood
  - Metal
  - Stone
  - Leather
  - Fabric
  - Plastic

- Texture source mode
  - Prompt: use prompt and material preset.
  - Reference: use an uploaded reference/material image.
  - Original: use the original image that created the model.
  - Current: use the model's current texture as the starting point.

- Optional reference image
  - Can be a material swatch, style image, object image, or texture reference.
  - If a reference image is selected, the UI should switch to Reference mode.

## Required Options

- Texture resolution
  - 1K
  - 2K
  - 4K

- Maps
  - Base color / albedo
  - Roughness
  - Normal
  - Metallic

- Variants
  - 1
  - 2
  - 4
  - Default should be 1 because extra variants cost more GPU time.

- Seed
  - 0 means random.
  - Any other number should make the result repeatable when possible.

- Strength
  - Controls how strongly the new direction changes the model's material.
  - Low strength should preserve more of the source/current texture.
  - High strength should follow the new direction more aggressively.

- Keep shape
  - On by default.
  - The user's expectation is that the selected model keeps its shape.
  - If a future mode allows shape changes, that must be explicit and separate.

## Required Outputs

- A new textured model result linked to the source model.
- The source model should remain available unchanged.
- Texture results should be grouped or traceable under the source model.
- When available, output should include:
  - GLB or equivalent model file
  - Base color / albedo map
  - Roughness map
  - Metallic map
  - Normal map

## Worker Capability Rules

- RTX 3090
  - Intended target for PBR texture jobs.
  - Should handle texture jobs that produce material maps.
  - Should handle Hunyuan3D 2.1 / PBR-capable texture work.

- GTX 1080
  - Only supports Hunyuan mesh generation.
  - Does not support PBR texture generation.
  - Should not receive PBR texture jobs.

This distinction must be visible in the product behavior. A texture job should not silently fall back to the GTX 1080 and produce a lower-capability result.

## Product Constraints

- Do not rerun Image to 3D as the Texture feature.
- Do not create a new mesh unless the user explicitly chooses a future shape-changing mode.
- Do not call the right rail Generated outputs. It is My assets.
- Do not hide the selected model picker permanently in the left panel.
- The compact model picker should show recent/likely models first.
- The full model picker should support many assets and should not close when a model is selected.

## Open Product Decisions

- How to label models that already have texture versus models that are untextured.
- How to show texture history under a source model.
- Whether Current mode should be disabled for untextured models or treated as a weak/default source.
- Whether 4K should be available immediately or reserved for later.
- Whether multiple variants should run as separate jobs or as one grouped texture job.
