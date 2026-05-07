// ─────────────────────────────────────────────────────────────────────────────
// multiViewProvider — single-image → multi-view diffusion call.
//
// Wraps a multi-view diffusion model (Zero123++ by default) hosted on
// Replicate. Unlike Flux image-to-image, these models are TRAINED for
// cross-view consistency: feed them one image and they output the SAME
// subject from different camera angles. Identity is preserved by the
// model's design, not by prompt yelling.
//
// Output shape: Zero123++ returns 6 views at fixed camera positions
// around the equator. We map them onto our internal view labels:
//
//   index 0 → three_q   (~30° azimuth)
//   index 1 → side      (~90°)
//   index 2 → back      (~150°)   ← closest to "directly behind"
//   index 3 →           (~210°)  used as fallback
//   index 4 →           (~270°)
//   index 5 →           (~330°)
//
// Top / bottom views are NOT in the Zero123++ output (no ±90° elevation).
// We surface that as an empty result for those labels — the caller
// decides whether to fall back to the old Flux-i2i path or skip them.
//
// Config:
//   REPLICATE_API_TOKEN    — required
//   REPLICATE_MV_MODEL     — default 'lucataco/zero123plusplus'
//   REPLICATE_MV_NUM_STEPS — default 36
// ─────────────────────────────────────────────────────────────────────────────

import sharp from 'sharp';

export type MultiViewLabel =
  | 'front' | 'three_q' | 'side' | 'back' | 'top' | 'bottom';

export interface MultiViewImage {
  label: MultiViewLabel;
  bytes: Buffer;
  contentType: string;
}

const REPLICATE_TOKEN = () => process.env.REPLICATE_API_TOKEN;
const REPLICATE_MODEL = () => process.env.REPLICATE_MV_MODEL || 'lucataco/zero123plusplus';
const REPLICATE_STEPS = () => parseInt(process.env.REPLICATE_MV_NUM_STEPS || '36', 10);

// Output index → label mapping. Indexes that don't map to a useful
// cardinal angle for our 6-slot UI are omitted — we don't store them.
const INDEX_TO_LABEL: Record<number, MultiViewLabel> = {
  0: 'three_q',  // ~30° azimuth — three-quarter front
  1: 'side',     // ~90° azimuth — right side profile
  2: 'back',     // ~150° azimuth — closest to direct back among the 6
  // 3, 4, 5 are at ~210°, ~270°, ~330° — currently unused.
};

/** Run the multi-view model. Returns however many of our labelled views
 *  were produced. Caller filters or maps as needed. */
export async function callMultiView(
  imageBytes: Buffer,
  mime: string,
): Promise<MultiViewImage[]> {
  const token = REPLICATE_TOKEN();
  if (!token) {
    throw new Error(
      'REPLICATE_API_TOKEN not set — multi-view alt-views unavailable. ' +
      'Add it to server/.env and restart.',
    );
  }

  // Replicate accepts data URLs or http URLs. Data URL avoids needing
  // a public R2 bucket.
  const safeMime =
    mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp'
      ? mime : 'image/jpeg';
  const dataUrl = `data:${safeMime};base64,${imageBytes.toString('base64')}`;

  const model = REPLICATE_MODEL();
  const url   = `https://api.replicate.com/v1/models/${model}/predictions`;

  // Prefer: wait=60 makes the call SYNCHRONOUSLY block server-side for
  // up to 60 seconds. Most Zero123++ runs finish in 8–25s. We keep
  // polling logic out of the hot path until we hit a timeout.
  const fr = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait=60',
    },
    body: JSON.stringify({
      input: {
        image: dataUrl,
        num_inference_steps: REPLICATE_STEPS(),
      },
    }),
  });

  if (!fr.ok) {
    const detail = await fr.text().catch(() => '');
    throw new Error(`Replicate ${fr.status}: ${detail.slice(0, 500)}`);
  }

  const data = await fr.json() as {
    output?: string[] | string;
    status?: string;
    error?: unknown;
  };
  if (data.error) {
    throw new Error(`Replicate error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
  }
  if (!data.output) {
    throw new Error(`Replicate returned no output (status=${data.status || 'unknown'})`);
  }

  // Some Zero123++ Replicate variants return an array of 6 image URLs;
  // others return a single 3×2 grid PNG. Detect both and unify.
  const out = data.output;
  const imgs: { bytes: Buffer; contentType: string }[] =
    Array.isArray(out)
      ? await Promise.all(out.map(downloadImage))
      : await splitGrid(await downloadImage(out));

  if (imgs.length < 3) {
    throw new Error(`Multi-view model returned only ${imgs.length} images; expected at least 3.`);
  }

  // Map indices to labels. Drop any image whose index isn't mapped.
  const views: MultiViewImage[] = [];
  for (let i = 0; i < imgs.length; i++) {
    const label = INDEX_TO_LABEL[i];
    if (!label) continue;
    views.push({ label, bytes: imgs[i].bytes, contentType: imgs[i].contentType });
  }
  return views;
}

/** GET a remote image URL → bytes + content-type. */
async function downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Image fetch ${r.status}: ${url}`);
  return {
    bytes: Buffer.from(await r.arrayBuffer()),
    contentType: r.headers.get('content-type') || 'image/png',
  };
}

/** Some MV models return a single 3×2 grid PNG. Crop into 6 sub-images
 *  (row-major: top-left → top-right → middle row, etc.) and return them
 *  in reading order. */
async function splitGrid(grid: { bytes: Buffer; contentType: string }): Promise<{ bytes: Buffer; contentType: string }[]> {
  const meta = await sharp(grid.bytes).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W === 0 || H === 0) throw new Error('Grid image has unknown dimensions');
  // Default Zero123++ grid is 3 columns × 2 rows.
  const cols = 3;
  const rows = 2;
  const cellW = Math.floor(W / cols);
  const cellH = Math.floor(H / rows);
  const out: { bytes: Buffer; contentType: string }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const buf = await sharp(grid.bytes)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .png()
        .toBuffer();
      out.push({ bytes: buf, contentType: 'image/png' });
    }
  }
  return out;
}
