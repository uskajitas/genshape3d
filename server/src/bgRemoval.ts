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
import sharp from 'sharp';

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
  /** Per-image quality stats from the harden pass. Only present when ok=true. */
  stats?: SubjectStats;
}

// Per-image quality stats produced as a side-effect of hardenAlpha. The
// caller (/api/upload) feeds these to qualityCheck() to decide whether the
// image is GPU-worthy before queueing the (expensive) Hunyuan job.
export interface SubjectStats {
  width: number;
  height: number;
  totalPx: number;
  /** Number of opaque pixels in the final hardened mask. */
  subjectPx: number;
  /** subjectPx / totalPx. */
  coverage: number;
  /** Tight bounding box of the opaque region. */
  bboxX: number;
  bboxY: number;
  bboxW: number;
  bboxH: number;
  /** subjectPx / (bboxW * bboxH). Low → silhouette is hollow / sparse. */
  bboxFill: number;
  /** Opaque pixels touching the outer 4-pixel border. */
  edgeTouching: number;
  /** edgeTouching / total border pixel count (0..1). */
  edgeTouchRatio: number;
  /** Number of connected components (4-neighbour). 1 = single subject. */
  components: number;
}

// Tunable knobs for hardenAlpha. Defaults match what we use server-side
// for the auto strip on /api/upload — they're tuned for clean Hunyuan3D
// inputs. The /api/text2image/assets/:id/edit-bg endpoint exposes them
// to the user for manual control.
export interface HardenOptions {
  /** Alpha threshold (0–255). Pixels above this become fully opaque,
   *  everything else fully transparent. Higher = stricter cutoff. */
  alphaThreshold?: number;
  /** Number of pixels to shrink the kept region after thresholding.
   *  0 = no erosion. Higher = tighter silhouette, removes fringe. */
  erodePx?: number;
  /** Composite the cutout over a solid background colour instead of
   *  leaving it transparent. RGB triplet 0–255 each. Undefined = keep
   *  alpha. */
  fillRgb?: [number, number, number];
}

// Post-process the rembg output:
//
//   1. THRESHOLD ALPHA. The U2-Net output has semi-transparent pixels along
//      the silhouette (alpha ∈ [1, 254]). Hunyuan3D reads those as thin
//      "kinda-there" geometry and extrudes sliver triangles → criss-cross
//      spurs on the mesh boundary. Snapping every pixel to fully-opaque or
//      fully-transparent eliminates the source of those slivers.
//
//   2. EROSION (configurable, default 1px). Even after thresholding, the
//      boundary still includes pixels that were "borderline rembg confident".
//      Pulling the silhouette in by N pixels guarantees the kept region
//      is solidly the subject.
//
//   3. ZERO RGB UNDER ALPHA=0 (or fill with a chosen colour). Helps PNG
//      compression and stops Hunyuan's internal pre-processor from finding
//      ghost colour data outside the kept region.
//
//   4. GATHER QUALITY STATS in the same pass — bbox, coverage, edge-touching,
//      connected components. These feed qualityCheck() so we can refuse
//      GPU-bound jobs whose input clearly won't produce a good mesh.
//
// All in one buffer pass, fast (<60ms on 1024²) and no extra allocations
// beyond a Uint8Array the size of the pixel grid.
// Run rembg ONLY — returns the raw RGBA PNG (with soft alpha) without
// any post-processing. Splitting this out lets the live-preview path
// cache the slow rembg step and re-run hardenAlpha alone on slider
// changes (~50ms per tweak instead of 2-3s).
export async function runRembgOnly(
  buf: Buffer,
  mimeIn = 'image/jpeg',
): Promise<Buffer> {
  const blob = await removeBackground(toBlob(buf, mimeIn), REMBG_CONFIG);
  warmed = true;
  return Buffer.from(await blob.arrayBuffer());
}

// Public re-export of the post-processing pass — exposed so the preview
// endpoint can re-run JUST hardenAlpha on a cached rembg result. Returns
// the same shape as the internal version (buffer + stats).
export async function hardenWithOptions(
  rgbaPng: Buffer,
  opts: HardenOptions = {},
): Promise<{ buffer: Buffer; stats: SubjectStats }> {
  return hardenAlpha(rgbaPng, opts);
}

async function hardenAlpha(
  rgbaPng: Buffer,
  opts: HardenOptions = {},
): Promise<{ buffer: Buffer; stats: SubjectStats }> {
  const { data, info } = await sharp(rgbaPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const totalPx = width * height;
  // Bail-out stats if the input is somehow not RGBA — strip stage will
  // already have failed loudly in that case, but be safe.
  if (channels !== 4) {
    return {
      buffer: rgbaPng,
      stats: emptyStats(width, height),
    };
  }

  // Threshold high (default 200/255) so the binary mask aggressively
  // excludes soft edge pixels. Caller can lower it to keep more of the
  // edge, or raise it for a stricter cutoff.
  const ALPHA_T = Math.max(1, Math.min(254, opts.alphaThreshold ?? 200));
  const ERODE_N = Math.max(0, Math.min(20, Math.round(opts.erodePx ?? 1)));
  const fill    = opts.fillRgb;

  // Pass 1: threshold. Result lands in `mask` (Uint8Array of width*height).
  const mask = new Uint8Array(totalPx);
  for (let p = 0, i = 3; p < mask.length; p++, i += 4) {
    mask[p] = data[i] >= ALPHA_T ? 1 : 0;
  }

  // Pass 2: N-pixel erosion. A kept pixel whose 4-neighbour contains a
  // dropped pixel is itself dropped. Repeating the pass N times shrinks
  // the silhouette by N pixels, removing increasingly-thick fringes.
  let prev = mask;
  let next = new Uint8Array(mask);
  for (let i = 0; i < ERODE_N; i++) {
    next.set(prev);
    for (let y = 1; y < height - 1; y++) {
      const rowAbove = (y - 1) * width;
      const rowMid   = y * width;
      const rowBelow = (y + 1) * width;
      for (let x = 1; x < width - 1; x++) {
        if (prev[rowMid + x] === 0) continue;
        if (
          prev[rowMid + x - 1] === 0 ||
          prev[rowMid + x + 1] === 0 ||
          prev[rowAbove + x]   === 0 ||
          prev[rowBelow + x]   === 0
        ) {
          next[rowMid + x] = 0;
        }
      }
    }
    [prev, next] = [next, prev];
  }
  const eroded = prev;

  // Pass 3: stats + RGBA write-back in one sweep.
  let subjectPx = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0, p = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++) {
      const i = p << 2;
      if (eroded[p]) {
        subjectPx++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        data[i + 3] = 255;
      } else if (fill) {
        // Composite over a solid fill colour instead of leaving the bg
        // transparent. Useful for non-3D output where the user wants a
        // clean white / black / brand-colour backdrop.
        data[i + 0] = fill[0];
        data[i + 1] = fill[1];
        data[i + 2] = fill[2];
        data[i + 3] = 255;
      } else {
        data[i + 0] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }

  // Edge-touching count: opaque pixels in the outermost ring.
  let edgeTouching = 0;
  // Top + bottom rows
  for (let x = 0; x < width; x++) {
    if (eroded[x]) edgeTouching++;
    if (eroded[(height - 1) * width + x]) edgeTouching++;
  }
  // Left + right cols (skip corners already counted)
  for (let y = 1; y < height - 1; y++) {
    if (eroded[y * width]) edgeTouching++;
    if (eroded[y * width + (width - 1)]) edgeTouching++;
  }
  const borderPx = (width + height) * 2 - 4;

  // Connected-components (4-neighbour) via iterative flood fill.
  const components = countComponents(eroded, width, height);

  const buffer = await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const bboxW = maxX >= 0 ? maxX - minX + 1 : 0;
  const bboxH = maxY >= 0 ? maxY - minY + 1 : 0;
  const stats: SubjectStats = {
    width,
    height,
    totalPx,
    subjectPx,
    coverage: subjectPx / totalPx,
    bboxX: maxX >= 0 ? minX : 0,
    bboxY: maxY >= 0 ? minY : 0,
    bboxW,
    bboxH,
    bboxFill: bboxW > 0 && bboxH > 0 ? subjectPx / (bboxW * bboxH) : 0,
    edgeTouching,
    edgeTouchRatio: borderPx > 0 ? edgeTouching / borderPx : 0,
    components,
  };
  return { buffer, stats };
}

function emptyStats(width: number, height: number): SubjectStats {
  return {
    width, height,
    totalPx: width * height,
    subjectPx: 0,
    coverage: 0,
    bboxX: 0, bboxY: 0, bboxW: 0, bboxH: 0,
    bboxFill: 0,
    edgeTouching: 0,
    edgeTouchRatio: 0,
    components: 0,
  };
}

// Iterative 4-neighbour flood fill, counting how many distinct opaque
// blobs the mask contains. Uses an explicit stack (not recursion) so we
// don't blow the call stack on big subjects. visited[] piggy-backs on a
// single Uint8Array; "1" = opaque & unvisited, "2" = opaque & visited.
function countComponents(mask: Uint8Array, width: number, height: number): number {
  const m = new Uint8Array(mask); // copy so we can mutate
  let count = 0;
  const stack: number[] = [];
  for (let p = 0; p < m.length; p++) {
    if (m[p] !== 1) continue;
    count++;
    stack.push(p);
    m[p] = 2;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % width;
      const y = (q - x) / width;
      // 4-neighbours
      if (x > 0          && m[q - 1] === 1) { m[q - 1] = 2; stack.push(q - 1); }
      if (x < width - 1  && m[q + 1] === 1) { m[q + 1] = 2; stack.push(q + 1); }
      if (y > 0          && m[q - width] === 1) { m[q - width] = 2; stack.push(q - width); }
      if (y < height - 1 && m[q + width] === 1) { m[q + width] = 2; stack.push(q + width); }
    }
  }
  return count;
}

// Run gating logic over the stats from hardenAlpha. Errors block the upload
// (we'd waste GPU time); warnings are returned for the client to surface
// but don't block. Thresholds are intentionally conservative — we only
// reject inputs that are clearly broken, not "could be better".
export interface QualityCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function qualityCheck(stats: SubjectStats): QualityCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Hard fails ─────────────────────────────────────────────────────────
  // Subject vanished entirely (or never existed). Could be: rembg removed
  // everything, image is blank, image is pure background, etc.
  if (stats.coverage < 0.005) {
    errors.push(
      'No clear subject detected — the cutout left less than 0.5% of the image. Try a photo with a clearer subject against a contrasting background.',
    );
  }
  // Cutout failed in the other direction — kept basically the whole frame.
  // Hunyuan will see this as "subject = entire image" and produce a flat
  // wall. Common causes: featureless / abstract image, screenshot of UI.
  if (stats.coverage > 0.95) {
    errors.push(
      'Background removal failed — almost the entire image was kept as the subject. Try an image with a single object on a distinct background.',
    );
  }

  // ── Warnings (still proceed) ──────────────────────────────────────────
  // Subject extends past the frame edge. Hunyuan will produce a mesh
  // that's flat/clipped on whichever side touches.
  if (stats.edgeTouchRatio > 0.05 && stats.coverage < 0.95) {
    warnings.push(
      'Subject extends past the image edge — the resulting 3D mesh will be cut off on that side. Centre the subject with margin around it for best results.',
    );
  }
  // Tiny subject lost in whitespace. Mesh detail is bound by silhouette
  // resolution; small subject = blurry mesh.
  if (stats.coverage > 0.005 && stats.coverage < 0.05) {
    warnings.push(
      `Subject takes up only ${(stats.coverage * 100).toFixed(1)}% of the frame — the 3D mesh will lack detail. Crop tighter to the subject for a sharper mesh.`,
    );
  }
  // Multiple disconnected blobs. Hunyuan reconstructs ONE object; with two
  // chess pieces or a person + their shadow you'll get a fused glob.
  if (stats.components > 1) {
    warnings.push(
      `Detected ${stats.components} separate subjects in the image. Hunyuan3D works best with one object — extra pieces may merge into the main mesh.`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function stripBackground(
  buf: Buffer,
  mimeIn = 'image/jpeg',
  opts: HardenOptions = {},
): Promise<StripResult> {
  try {
    const blob = await removeBackground(toBlob(buf, mimeIn), REMBG_CONFIG);
    const rawPng = Buffer.from(await blob.arrayBuffer());
    const { buffer: hardened, stats } = await hardenAlpha(rawPng, opts);
    warmed = true;
    console.log(
      `[rembg] stripped ${buf.length}B (${mimeIn}) → ${hardened.length}B hardened ` +
      `(threshold=${opts.alphaThreshold ?? 200}, erode=${opts.erodePx ?? 1}, ` +
      `fill=${opts.fillRgb ? 'rgb' : 'none'}) ` +
      `coverage=${(stats.coverage * 100).toFixed(1)}% edge=${(stats.edgeTouchRatio * 100).toFixed(1)}% comps=${stats.components}`,
    );
    return { buffer: hardened, mimetype: 'image/png', ok: true, stats };
  } catch (e: any) {
    console.warn('[rembg] strip failed, falling back to original:', e?.message || e);
    return { buffer: buf, mimetype: '', ok: false };
  }
}
