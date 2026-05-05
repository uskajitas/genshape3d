// ─────────────────────────────────────────────────────────────────────────────
// Server-side background removal — runs on every /api/upload before the image
// hits R2 + the Hunyuan3D worker.
//
// Why: Hunyuan3D-2 internally runs `rembg` (U2-Net) to alpha-mask the subject
// before mesh generation. That step fails silently on dark / black / low-
// contrast backgrounds — the model then treats the entire frame as the
// subject and extrudes a flat "wall" of geometry behind the actual mesh.
//
// Doing the segmentation here, BEFORE upload, gives us:
//   - A pre-alpha-masked PNG that Hunyuan eats reliably regardless of the
//     original background colour
//   - One single source of truth for cutout quality (we control the model)
//   - Graceful fallback: if rembg crashes (oversized image, OOM, etc.) we
//     pass the original buffer through and let Hunyuan try its best
//
// Cost: ~3s on first call (ONNX model load), ~300-500ms on subsequent calls.
// ─────────────────────────────────────────────────────────────────────────────

import { removeBackground, Config } from '@imgly/background-removal-node';

// Use the small (~50MB) model — accuracy is fine for product / object shots,
// and it's noticeably faster than `medium`. We can revisit if users complain
// about edges (typically only happens with hair / fur).
const REMBG_CONFIG: Config = {
  model: 'small',
};

// Track whether the ONNX model has been loaded into memory. The first
// removeBackground() call is slow because it lazy-loads the model. We expose
// warmRembg() so server startup can pre-pay that cost.
let warmed = false;

export async function warmRembg(): Promise<void> {
  if (warmed) return;
  try {
    // 1×1 transparent PNG — smallest possible valid input. The model loads
    // even though the "image" is degenerate.
    const tiny = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64',
    );
    await removeBackground(tiny, REMBG_CONFIG);
    warmed = true;
    console.log('[rembg] model warmed');
  } catch (e: any) {
    console.warn('[rembg] warmup failed (non-fatal):', e?.message || e);
  }
}

export interface StripResult {
  buffer: Buffer;
  /** Always 'image/png' on success (alpha channel required). Empty when the
   *  caller should fall back to the original mimetype. */
  mimetype: string;
  /** True when rembg ran successfully; false on any failure (caller should
   *  use the original buffer / mimetype it had before calling us). */
  ok: boolean;
}

export async function stripBackground(buf: Buffer): Promise<StripResult> {
  try {
    const blob = await removeBackground(buf, REMBG_CONFIG);
    const ab = await blob.arrayBuffer();
    warmed = true;
    return { buffer: Buffer.from(ab), mimetype: 'image/png', ok: true };
  } catch (e: any) {
    console.warn('[rembg] strip failed, falling back to original:', e?.message || e);
    return { buffer: buf, mimetype: '', ok: false };
  }
}
