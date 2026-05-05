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

// Track whether the ONNX model has been loaded into memory. First real
// removeBackground() call pays the ~3s lazy-load cost. We deliberately do
// NOT pre-warm with a synthetic image: getting a tiny test image past the
// lib's decoder + encoder + 4-channel requirements isn't worth the
// fragility. The first user upload after a cold start is ~3s slower; every
// subsequent upload is fast.
let warmed = false;

// IMPORTANT: @imgly/background-removal-node detects the input format from the
// Blob's MIME type. If you pass a raw Buffer the lib wraps it in `new Blob([buf])`
// with NO type — which then fails the format dispatch with the cryptic error
// "Unsupported format: ". Always wrap the buffer ourselves with a proper
// image/* MIME so the JPEG/PNG/WebP branch fires.
function toBlob(buf: Buffer, mime: string): Blob {
  // Default to image/jpeg if mime is empty/unknown — Sharp will sniff the
  // actual format from the bytes anyway, the MIME just has to be one of the
  // four whitelisted strings to pass the dispatch.
  const safeMime =
    mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp'
      ? mime
      : 'image/jpeg';
  return new Blob([buf], { type: safeMime });
}

// No-op kept for index.ts boot wiring — see comment on `warmed` above.
export async function warmRembg(): Promise<void> {
  return;
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

export async function stripBackground(buf: Buffer, mimeIn = 'image/jpeg'): Promise<StripResult> {
  try {
    const blob = await removeBackground(toBlob(buf, mimeIn), REMBG_CONFIG);
    const ab = await blob.arrayBuffer();
    warmed = true;
    console.log(`[rembg] stripped ${buf.length}B (${mimeIn}) → ${ab.byteLength}B png`);
    return { buffer: Buffer.from(ab), mimetype: 'image/png', ok: true };
  } catch (e: any) {
    console.warn('[rembg] strip failed, falling back to original:', e?.message || e);
    return { buffer: buf, mimetype: '', ok: false };
  }
}
