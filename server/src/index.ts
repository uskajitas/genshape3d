import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { initDb } from './db';
import {
  upsertOnLogin, recordLoginEvent, getAppUser,
  listAppUsers, setUserRole, deductCredit,
  isAdminEmail, UserRole,
} from './usersRepo';
import { uploadToR2, getR2Stream } from './r2';
import { stripBackground, warmRembg, qualityCheck } from './bgRemoval';
import { createJob, getJobsByUser, listAllJobs, listPendingJobs, listCancelledJobs, updateJobStatus, cancelJob, renameJob, deleteJob, countUserJobsSince } from './jobsRepo';
import { listPacks, createCheckout, stripeWebhook } from './billing';
import { createAsset, listAssetsByUser, renameAsset, deleteAsset, getAssetById, setAssetReadyFor3D, applyAssetEdit, revertAssetEdit } from './text2imageRepo';

const app = express();
const port = process.env.PORT || 8110;
const clientOrigin = process.env.CLIENT_ORIGIN_URL || 'http://localhost:3110';

app.use(cors({
  origin: clientOrigin,
  credentials: true,
  // Expose the X-Final-Prompt / X-Seed headers from /api/text2image so the
  // browser can read them to display the composed prompt in the UI.
  exposedHeaders: ['X-Final-Prompt', 'X-Seed', 'X-Provider', 'X-Asset-Id', 'X-Image-Key'],
}));

// Stripe webhook needs the raw body for signature verification — register it
// BEFORE the JSON body parser kicks in.
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook,
);

app.use(express.json());

// Other billing routes (after express.json is set up).
app.get('/api/billing/packs', listPacks);
app.post('/api/billing/checkout', createCheckout);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── Health ─────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Image proxy from R2 ───────────────────────────────────────────────────────

app.get('/api/image', async (req, res) => {
  const key = req.query.key as string;
  if (!key) return res.status(400).json({ error: 'key required' });
  try {
    const obj = await getR2Stream(key);
    res.setHeader('Content-Type', (obj.ContentType as string) || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    (obj.Body as any).pipe(res);
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

app.get('/api/mesh', async (req, res) => {
  let key = req.query.key as string;
  if (!key) return res.status(400).json({ error: 'key required' });
  // If a full URL was passed, extract just the key (everything after /<bucket>/)
  if (key.startsWith('http')) {
    const bucket = process.env.R2_BUCKET || 'genshape3d';
    const marker = `/${bucket}/`;
    const idx = key.indexOf(marker);
    if (idx !== -1) key = key.slice(idx + marker.length);
  }
  try {
    const obj = await getR2Stream(key);
    res.setHeader('Content-Type', (obj.ContentType as string) || 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    (obj.Body as any).pipe(res);
  } catch (e: any) {
    res.status(404).json({ error: 'not found', detail: e.message });
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { email, name, picture } = req.body as { email?: string; name?: string; picture?: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const user = await upsertOnLogin(email, name || '', picture || '');
    await recordLoginEvent(email, name || '');
    res.json({ user });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = await getAppUser(email);
  if (!user) return res.json({ approved: false, role: 'free', exists: false, credits: 0 });
  res.json({
    approved: Boolean(user.approved),
    role: user.role,
    exists: true,
    credits: user.credits,
    name: user.name,
    picture: user.picture,
  });
});

// ── Upload → R2 → job ─────────────────────────────────────────────────────────

// ── Rate limit (free tier) ───────────────────────────────────────────────────
// Free users get FREE_LIMIT_PER_24H jobs in any rolling 24 h window. Admins
// are exempt. The cap is intentionally low while we run on a single home GPU
// so wait times stay reasonable for everyone.

const FREE_LIMIT_PER_24H = parseInt(process.env.FREE_LIMIT_PER_24H || '3', 10);

const checkRateLimit = async (email: string): Promise<{ ok: boolean; used: number; limit: number }> => {
  if (isAdminEmail(email)) return { ok: true, used: 0, limit: Infinity as any };
  const used = await countUserJobsSince(email, 24);
  return { ok: used < FREE_LIMIT_PER_24H, used, limit: FREE_LIMIT_PER_24H };
};

// ── Text-to-image proxy ─────────────────────────────────────────────────────
// Pollinations now blocks browser-origin requests with a 403, so we proxy
// the call server-side. The browser sends ?prompt=…, we fetch a 1024² image
// from Pollinations with no Referer/Origin headers and pipe it back.
// ─── Structured-prompt vocabulary ────────────────────────────────────────────
// The text-to-image page sends structured parameters (background, view, etc.)
// alongside the raw user prompt. We compose them into a single prompt here on
// the server so all clients (web, future mobile, scripts) get identical
// behaviour and the dictionary lives in one place.

const BG_CLAUSE: Record<string, string> = {
  white:  'plain white background, no shadows on background',
  studio: 'soft grey studio backdrop, gentle gradient, no harsh shadows',
  dark:   'deep neutral dark backdrop, low-key lighting, no clutter',
  black:  'pure solid black background #000000, no gradients, no reflections on background',
  iso:    'isolated subject, no background details, plain off-white surround',
  none:   '',
};

// VIEW = camera direction (where the camera is). Pure direction now;
// projection style lives in PROJECTION_CLAUSE below. Six cardinal-ish
// options to support full multi-view 3D coverage (front/back/left/right
// equivalents), plus 3/4 because it's the standard product-shot angle.
const VIEW_CLAUSE: Record<string, string> = {
  front:   'front-facing view, head-on, camera at subject eye level',
  three_q: '3/4 front view, slight angle showing depth on one side',
  side:    'side profile view, camera at 90° to the subject',
  back:    'back view, camera directly behind the subject',
  top:     'top-down view, camera looking straight down at the subject',
  bottom:  'bottom-up view, camera looking straight up at the subject',
  none:    '',
};

// PROJECTION = how the image is drawn. Independent of direction.
//   perspective — what a real camera sees (vanishing points, foreshortening).
//   isometric   — parallel projection, no foreshortening, classic game style.
const PROJECTION_CLAUSE: Record<string, string> = {
  perspective: 'standard perspective rendering, natural camera lens, realistic depth',
  isometric:   'isometric projection, parallel lines, no perspective distortion, classic isometric video-game style',
  none:        '',
};

const SCALE_CLAUSE: Record<string, string> = {
  fill:    'subject fills the frame edge to edge',
  margin:  'subject centered with comfortable margin around it',
  none:    '',
};

const STYLE_CLAUSE: Record<string, string> = {
  photoreal: 'studio product photography, photorealistic, tack sharp, crisp edges, high detail, 8k resolution',
  clay:      'matte clay render, smooth neutral surface, even lighting, sharp edges, crisp',
  neutral:   'flat shaded neutral material, no textures, even lighting, sharp, crisp',
  toon:      'toon-shaded 3D model render, clean cel shading, crisp outlines, sharp',
  none:      '',
};

const MATERIAL_CLAUSE: Record<string, string> = {
  auto:    '',
  ceramic: 'ceramic surface, smooth glaze',
  metal:   'brushed metal surface',
  wood:    'natural wood surface, visible grain',
  plastic: 'matte plastic surface',
  fabric:  'soft fabric surface',
  glass:   'transparent glass material',
  stone:   'stone surface, rough finish',
};

// Tokens we always inject so the upstream doesn't produce 3D-unfriendly output.
// Heavier "no plurals / no groups" tokens because models love to interpret
// e.g. "a pawn" as a chess set context and return all eight.
const ALWAYS_NEGATIVE =
  'multiple objects, group, set, collection, pair, duplicate, two, three, ' +
  'many, several, scene, environment, surroundings, busy background, ' +
  'watermark, logo, text, signature, ' +
  'blurry, blur, out of focus, soft focus, fuzzy, hazy, unfocused, ' +
  'motion blur, depth-of-field bokeh, lens blur, ' +
  'low resolution, low quality, low detail, grainy, noisy, jpeg artifacts, pixelated';

const composeFinalPrompt = (q: Record<string, any>): string => {
  const userPrompt = String(q.prompt || '').trim();
  const strict = String(q.strict_single || '1') !== '0';
  // When strict, prepend "one single isolated" + suffix "alone" + an explicit
  // "exactly one subject" line. Three near-synonyms for "exactly one" tend
  // to override the model's group bias for items that have a contextual
  // plural (chess pieces, a flock, a deck of cards).
  const parts: string[] = [
    strict ? `one single isolated ${userPrompt}, alone` : userPrompt,
  ];
  if (strict) parts.push('exactly one subject in frame, no other items');

  const bg     = BG_CLAUSE[String(q.bg || 'white')]                  ?? BG_CLAUSE.white;
  const view   = VIEW_CLAUSE[String(q.view || 'three_q')]            ?? VIEW_CLAUSE.three_q;
  const proj   = PROJECTION_CLAUSE[String(q.projection || 'perspective')] ?? PROJECTION_CLAUSE.perspective;
  const scale  = SCALE_CLAUSE[String(q.scale || 'margin')]           ?? SCALE_CLAUSE.margin;
  const style  = STYLE_CLAUSE[String(q.style || 'photoreal')]        ?? STYLE_CLAUSE.photoreal;
  const mat    = MATERIAL_CLAUSE[String(q.material || 'auto')]       ?? '';

  for (const c of [bg, view, proj, scale, style, mat]) {
    if (c) parts.push(c);
  }
  return parts.filter(Boolean).join(', ');
};

// ─── Smart asset name from prompt ────────────────────────────────────────────
// Strips articles/prepositions/filler, keeps the first 3 meaningful words,
// title-cases the result. e.g. "a small ceramic vase with smooth glaze" → "Ceramic Vase"
const STOP = new Set([
  'a','an','the','this','that','some','any',
  'with','without','and','or','but','of','in','on','at','to','for','from','by',
  'very','quite','really','slightly','heavily','perfectly','beautifully',
  'small','large','big','tiny','huge','little',
  'old','new','modern','ancient','simple','complex',
  'no','not','just','only','also','even',
]);

const smartAssetName = (prompt: string): string => {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w));

  // Take up to 3 meaningful words
  const picked = words.slice(0, 3);
  if (!picked.length) return prompt.slice(0, 32).trim();

  return picked
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// ─── Provider implementations ────────────────────────────────────────────────
// Each takes the composed prompt + dimensions + seed and returns a binary
// image buffer. Adding a new provider = add another entry here + a UI option.

interface T2IRequest {
  prompt: string;
  negative: string;
  width: number;
  height: number;
  seed: number;
}

const callPollinations = async (req: T2IRequest): Promise<{ buf: Buffer; contentType: string }> => {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(req.prompt)}` +
    `?width=${req.width}&height=${req.height}&nologo=true&seed=${req.seed}` +
    (req.negative ? `&negative_prompt=${encodeURIComponent(req.negative)}` : '');
  const r = await fetch(url, { headers: { 'User-Agent': 'genshape3d/1.0' } });
  if (!r.ok) throw new Error(`pollinations ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length === 0) throw new Error('pollinations empty response');
  return { buf, contentType: r.headers.get('content-type') || 'image/jpeg' };
};

// Map our (w,h) onto fal's named image_size enum.
const falImageSize = (w: number, h: number): string => {
  const ratio = w / h;
  if (ratio > 1.5)  return 'landscape_16_9';
  if (ratio > 1.1)  return 'landscape_4_3';
  if (ratio < 0.67) return 'portrait_16_9';
  if (ratio < 0.91) return 'portrait_4_3';
  return 'square_hd';
};

const callFalEndpoint = async (
  endpoint: string,
  steps: number,
  req: T2IRequest,
): Promise<{ buf: Buffer; contentType: string }> => {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY not configured');

  const fr = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: req.prompt,
      image_size: falImageSize(req.width, req.height),
      num_inference_steps: steps,
      seed: req.seed,
      enable_safety_checker: true,
    }),
  });
  if (!fr.ok) throw new Error(`fal.ai ${fr.status} ${await fr.text().catch(() => '')}`);
  const data = await fr.json() as { images?: { url: string }[] };
  const imgUrl = data.images?.[0]?.url;
  if (!imgUrl) throw new Error('fal.ai returned no image');

  const ir = await fetch(imgUrl);
  if (!ir.ok) throw new Error(`fal cdn ${ir.status}`);
  const buf = Buffer.from(await ir.arrayBuffer());
  return { buf, contentType: ir.headers.get('content-type') || 'image/jpeg' };
};

const callFalFluxSchnell = (req: T2IRequest) => callFalEndpoint('fal-ai/flux/schnell',  4,  req);
const callFalFluxPro     = (req: T2IRequest) => callFalEndpoint('fal-ai/flux-pro/v1.1', 28, req);

// ── Alt-view (image-to-image) caller ────────────────────────────────────────
//
// Takes a publicly-fetchable URL of an existing image + a prompt describing
// the new angle, and returns the image-to-image result as a Buffer. We use
// fal-ai/flux/dev/image-to-image because it's the cheapest hosted Flux
// variant that accepts an image conditioner.
//
// Strength is the key knob: higher = more deviation from source. For
// "rotate to a new angle" we want noticeable change but with the source
// still influencing identity / colour / lighting. 0.85 is a reasonable
// starting point — we'll tune after seeing real outputs.
async function callFalImageToImage(args: {
  imageUrl: string;
  prompt: string;
  strength?: number;
  steps?: number;
  seed?: number;
  imageSize?: string;
}): Promise<{ buf: Buffer; contentType: string }> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY not configured');

  const fr = await fetch('https://fal.run/fal-ai/flux/dev/image-to-image', {
    method: 'POST',
    headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: args.imageUrl,
      prompt: args.prompt,
      strength: args.strength ?? 0.85,
      num_inference_steps: args.steps ?? 28,
      seed: args.seed ?? Math.floor(Math.random() * 1e9),
      image_size: args.imageSize ?? 'square_hd',
      enable_safety_checker: true,
    }),
  });
  if (!fr.ok) throw new Error(`fal.ai i2i ${fr.status} ${await fr.text().catch(() => '')}`);
  const data = await fr.json() as { images?: { url: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error('fal.ai i2i returned no image');

  const ir = await fetch(url);
  if (!ir.ok) throw new Error(`fal cdn ${ir.status}`);
  return {
    buf: Buffer.from(await ir.arrayBuffer()),
    contentType: ir.headers.get('content-type') || 'image/jpeg',
  };
}

const callHFInference = async (req: T2IRequest): Promise<{ buf: Buffer; contentType: string }> => {
  const key = process.env.HF_TOKEN;
  if (!key) throw new Error('HF_TOKEN not configured');

  // Free-tier endpoint. Slow on cold start (10-30s) but has no per-call cost.
  const hr = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'x-wait-for-model': 'true',
    },
    body: JSON.stringify({
      inputs: req.prompt,
      parameters: {
        width: req.width,
        height: req.height,
        num_inference_steps: 4,
        seed: req.seed,
      },
    }),
  });
  if (!hr.ok) throw new Error(`hf ${hr.status} ${await hr.text().catch(() => '')}`);
  const buf = Buffer.from(await hr.arrayBuffer());
  if (buf.length === 0) throw new Error('hf empty response');
  return { buf, contentType: hr.headers.get('content-type') || 'image/jpeg' };
};

const callOpenAIDallE3 = async (req: T2IRequest): Promise<{ buf: Buffer; contentType: string }> => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  // DALL-E 3 only supports three sizes. Pick the closest match.
  const ratio = req.width / req.height;
  const size =
    ratio > 1.3  ? '1792x1024' :
    ratio < 0.77 ? '1024x1792' :
                   '1024x1024';

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: req.prompt,
      n: 1,
      size,
      quality: 'standard', // 'hd' = ~$0.08 vs 'standard' = ~$0.04
      response_format: 'url',
    }),
  });
  if (!r.ok) throw new Error(`openai ${r.status} ${await r.text().catch(() => '')}`);
  const data = await r.json() as { data?: { url: string }[] };
  const imgUrl = data.data?.[0]?.url;
  if (!imgUrl) throw new Error('openai returned no image');

  const ir = await fetch(imgUrl);
  if (!ir.ok) throw new Error(`openai cdn ${ir.status}`);
  const buf = Buffer.from(await ir.arrayBuffer());
  return { buf, contentType: ir.headers.get('content-type') || 'image/png' };
};

const T2I_PROVIDERS: Record<string, (req: T2IRequest) => Promise<{ buf: Buffer; contentType: string }>> = {
  pollinations:       callPollinations,
  'fal-flux-schnell': callFalFluxSchnell,
  'fal-flux-pro':     callFalFluxPro,
  'hf-flux-schnell':  callHFInference,
  'openai-dall-e-3':  callOpenAIDallE3,
};

app.get('/api/text2image', async (req, res) => {
  const prompt = String(req.query.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  // Caller can opt out of structured prompt composition with raw=1 (debug/eval).
  const finalPrompt = req.query.raw === '1' ? prompt : composeFinalPrompt(req.query);

  // Optional width/height; clamped to a sensible range.
  const w = Math.max(256, Math.min(1536, parseInt(req.query.w as string) || 1024));
  const h = Math.max(256, Math.min(1536, parseInt(req.query.h as string) || 1024));

  // Optional negative prompt — caller can add their own avoid-tokens.
  const userNegative = String(req.query.negative || '').trim();
  const negative = [ALWAYS_NEGATIVE, userNegative].filter(Boolean).join(', ');

  const seed = Number.isFinite(Number(req.query.seed))
    ? Number(req.query.seed)
    : Math.floor(Math.random() * 1_000_000);

  const provider = String(req.query.provider || 'pollinations');
  const fn = T2I_PROVIDERS[provider];
  if (!fn) return res.status(400).json({ error: `unknown provider: ${provider}` });

  try {
    const { buf, contentType } = await fn({
      prompt: finalPrompt,
      negative,
      width: w,
      height: h,
      seed,
    });

    // If the caller supplied an email, persist the image to R2 + DB so it
    // survives reloads. Without an email (e.g. anonymous tests, scripts) we
    // just stream the bytes back as before.
    const email = String(req.query.email || '').trim();
    let assetId = '';
    let imageKey = '';
    if (email) {
      try {
        const ext = contentType.includes('png') ? '.png' : '.jpg';
        const filename = `t2i-${Date.now()}${ext}`;
        const uploaded = await uploadToR2(buf, filename, contentType);
        // The uploadToR2 helper puts everything under uploads/ — for clarity
        // we keep that; the proxy /api/image?key=… already accepts any key.
        imageKey = uploaded.key;

        const asset = await createAsset({
          userEmail: email,
          name: smartAssetName(String(req.query.prompt || '')),
          prompt: String(req.query.prompt || ''),
          finalPrompt,
          params: {
            bg: req.query.bg, view: req.query.view,
            projection: req.query.projection || 'perspective',
            scale: req.query.scale,
            style: req.query.style, material: req.query.material,
            aspect: req.query.aspect, w, h,
            strict_single: req.query.strict_single,
          },
          provider,
          imageKey,
          seed,
          parentAssetId: null,         // primary view — original generation
          // The actual angle the user picked. Used downstream by the alt-views
          // generator to skip THIS angle and only produce the missing ones.
          viewLabel:     String(req.query.view || 'front'),
          readyFor3D:    true,         // default ON — user can toggle off later
        });
        assetId = asset.id;
      } catch (saveErr: any) {
        // Non-fatal: still return the image bytes so the user sees a result.
        console.error('[text2image] save failed:', saveErr.message);
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Final-Prompt', encodeURIComponent(finalPrompt));
    res.setHeader('X-Seed', String(seed));
    res.setHeader('X-Provider', provider);
    if (assetId)  res.setHeader('X-Asset-Id', assetId);
    if (imageKey) res.setHeader('X-Image-Key', encodeURIComponent(imageKey));
    res.send(buf);
  } catch (e: any) {
    console.error('[text2image]', provider, e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── Text-to-image asset CRUD ────────────────────────────────────────────────

app.get('/api/text2image/assets', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const assets = await listAssetsByUser(email);
    res.json({ assets });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Per-view angle hints. The phrasing is deliberately blunt + repetitive —
// Flux i2i is strongly biased toward the input image's composition, so
// the prompt has to hammer the rotation directive hard to actually get a
// different angle out. We repeat the rotation cue multiple times and
// include explicit "NOT a front view" negatives because Flux respects
// those.
const VIEW_ANGLE_HINTS: Record<string, string> = {
  front:
    'front view, head-on, camera facing the subject directly, no rotation, frontal angle',
  three_q:
    'three-quarter angle view, 3/4 view, ROTATED 45 DEGREES clockwise, ' +
    'diagonal perspective, the subject is angled showing both front AND ' +
    'one side simultaneously, partial profile, NOT a straight-on front view',
  side:
    'side profile view, side view, ROTATED 90 DEGREES, full lateral profile, ' +
    'camera at 90 degrees to the subject, ONLY the side visible, ' +
    'side silhouette, profile picture, NOT a front view',
  back:
    'back view, rear view, ROTATED 180 DEGREES, viewed from directly BEHIND, ' +
    'back of subject visible, posterior side, looking at the rear, ' +
    'NOT a front view',
  top:
    'top-down view, overhead view, camera looking straight DOWN from above, ' +
    "bird's-eye view, plan view, NOT a front view",
  bottom:
    'bottom-up view, view from below, camera looking straight UP from underneath, ' +
    "worm's-eye view, NOT a front view",
};

// Strength controls how far the i2i sampler drifts from the source image.
// Lower = closer to source (good for identity, bad for rotation). Higher =
// stronger re-composition (good for rotation, risk of identity drift).
//
// We've capped these at 0.85 because Flux i2i above that point starts to
// re-imagine the subject's *shape*, not just its angle, so a Logitech
// keyboard ends up as a vaguely keyboard-shaped melted blob. Below 0.7
// the rotation barely happens at all. There is NO sweet spot for this
// model — the proper fix is to swap in a multi-view diffusion model
// (Zero123++ / Era3D / Hunyuan-MV) that actually understands viewpoints.
const VIEW_STRENGTH: Record<string, number> = {
  front:   0.55,
  three_q: 0.78,
  side:    0.82,
  back:    0.85,
  top:     0.82,
  bottom:  0.82,
};

// Generate ONE alt view of a primary image at the requested angle.
// Body: { email, parentAssetId, viewLabel }. Persists ONE new asset row
// linked to the parent. Returns that single asset.
//
// Caveat: Flux image-to-image is NOT a true 3D rotator — it's a noise-
// conditioned re-paint. Identity preservation is good (~80%) but each
// alt view may have small colour / detail drift. Cheap first cut; better
// quality comes from fal-ai/hunyuan3d-mv-paint or Zero123-style models.
app.post('/api/text2image/alt-views', async (req, res) => {
  const { email, parentAssetId, viewLabel } = req.body as {
    email?: string; parentAssetId?: string; viewLabel?: string;
  };
  if (!email)         return res.status(400).json({ error: 'email required' });
  if (!parentAssetId) return res.status(400).json({ error: 'parentAssetId required' });
  if (!viewLabel)     return res.status(400).json({ error: 'viewLabel required' });
  const angleHint = VIEW_ANGLE_HINTS[viewLabel];
  if (!angleHint)     return res.status(400).json({ error: `unknown viewLabel: ${viewLabel}` });

  try {
    const parent = await getAssetById(parentAssetId, email);
    if (!parent) return res.status(404).json({ error: 'parent asset not found' });
    if (parent.viewLabel === viewLabel) {
      return res.status(409).json({ error: `parent is already a ${viewLabel} view` });
    }

    // Pull the parent image bytes from R2 and pass them to fal as a
    // data URL. Going URL-via-public-bucket fails when R2 is configured
    // for private access (fal can't reach r2.cloudflarestorage.com),
    // and we don't want to depend on R2_PUBLIC_URL being set + the
    // bucket being publicly browsable.
    const r2Result = await getR2Stream(parent.imageKey);
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of r2Result.Body as any) chunks.push(Buffer.from(chunk));
    const sourceBytes = Buffer.concat(chunks);
    const sourceMime = r2Result.ContentType || 'image/jpeg';
    const sourceUrl  = `data:${sourceMime};base64,${sourceBytes.toString('base64')}`;

    // Carry the parent's projection (perspective | isometric) into the prompt.
    const projection: string = (parent.params?.projection as string) || 'perspective';
    const projectionHint = projection === 'isometric'
      ? 'isometric projection, parallel lines, no perspective distortion'
      : 'standard perspective rendering, natural lens';

    const baseSubject = parent.prompt;
    // Lead the prompt with the angle directive so it carries the most
    // weight in the diffusion guidance (Flux pays the most attention to
    // the start of the prompt). Identity-preservation cues come AFTER.
    const prompt =
      `${angleHint}. ${baseSubject}, ${projectionHint}, ` +
      `same subject, same colours, same lighting, same materials, ` +
      `${parent.params?.style || 'clean'} style, studio render, no other items in frame`;

    const strength = VIEW_STRENGTH[viewLabel] ?? 0.9;
    const { buf, contentType } = await callFalImageToImage({
      imageUrl: sourceUrl,
      prompt,
      strength,
    });
    const ext = contentType.includes('png') ? '.png' : '.jpg';
    const filename = `t2i-${viewLabel}-${Date.now()}${ext}`;
    const uploaded = await uploadToR2(buf, filename, contentType);
    const asset = await createAsset({
      userEmail:     email,
      name:          `${parent.name} (${viewLabel})`,
      prompt:        baseSubject,
      finalPrompt:   prompt,
      params:        parent.params,
      provider:      'fal-flux-i2i',
      imageKey:      uploaded.key,
      seed:          null,
      parentAssetId: parent.id,
      viewLabel,
      readyFor3D:    true,
    });

    res.json({ asset });
  } catch (e: any) {
    console.error('[alt-views] fatal:', e?.message || e);
    res.status(500).json({ error: e?.message || 'alt-views failed' });
  }
});

// Toggle the readyFor3D flag on a single asset. Body: { ready: boolean }.
// When false, the image is excluded from the Workspace filmstrip picker so
// users can mark "this came out badly" without deleting it.
app.patch('/api/text2image/assets/:id/ready-for-3d', async (req, res) => {
  const { ready } = req.body as { ready?: boolean };
  if (typeof ready !== 'boolean') return res.status(400).json({ error: 'ready (boolean) required' });
  try {
    await setAssetReadyFor3D(req.params.id, ready);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Edit the background of an asset using user-supplied rembg + harden
// parameters. Body: {
//   alphaThreshold?: number 1..254
//   erodePx?:        number 0..20
//   fillRgb?:        [r, g, b]   // optional solid background; omit for transparent
// }
//
// The original image is preserved on R2; the asset row's image_key
// becomes the edited file, originalImageKey holds the original.
// Re-edits always start from the ORIGINAL (not the previous edit) so
// the user can iterate on parameters without compounding artifacts.
app.post('/api/text2image/assets/:id/edit-bg', async (req, res) => {
  const email = String(req.body?.email || req.query?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });

  const opts = {
    alphaThreshold: typeof req.body?.alphaThreshold === 'number' ? req.body.alphaThreshold : undefined,
    erodePx:        typeof req.body?.erodePx        === 'number' ? req.body.erodePx        : undefined,
    fillRgb:        Array.isArray(req.body?.fillRgb) && req.body.fillRgb.length === 3
      ? [Number(req.body.fillRgb[0]), Number(req.body.fillRgb[1]), Number(req.body.fillRgb[2])] as [number, number, number]
      : undefined,
  };

  try {
    const asset = await getAssetById(req.params.id, email);
    if (!asset) return res.status(404).json({ error: 'asset not found' });

    // Always re-edit from the ORIGINAL key (never the current edited
    // image_key) so re-running with new params doesn't compound artefacts.
    const sourceKey = asset.originalImageKey || asset.imageKey;
    const r2Result = await getR2Stream(sourceKey);
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of r2Result.Body as any) chunks.push(Buffer.from(chunk));
    const sourceBytes = Buffer.concat(chunks);
    const sourceMime  = r2Result.ContentType || 'image/jpeg';

    const stripped = await stripBackground(sourceBytes, sourceMime, opts);
    if (!stripped.ok) {
      return res.status(500).json({ error: 'background removal failed' });
    }

    // Upload the edited PNG to a fresh R2 key, then point the asset row
    // at it. applyAssetEdit() preserves the existing originalImageKey if
    // already set, otherwise records the current image_key as the original.
    const filename = `t2i-edit-${Date.now()}.png`;
    const uploaded = await uploadToR2(stripped.buffer, filename, stripped.mimetype || 'image/png');
    await applyAssetEdit(asset.id, uploaded.key);

    const updated = await getAssetById(asset.id, email);
    res.json({ asset: updated });
  } catch (e: any) {
    console.error('[edit-bg] failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'edit-bg failed' });
  }
});

// Revert any edits — swap originalImageKey back to image_key.
app.post('/api/text2image/assets/:id/revert', async (req, res) => {
  const email = String(req.body?.email || req.query?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const asset = await getAssetById(req.params.id, email);
    if (!asset) return res.status(404).json({ error: 'asset not found' });
    if (!asset.originalImageKey) return res.json({ asset });   // nothing to revert
    await revertAssetEdit(asset.id);
    const updated = await getAssetById(asset.id, email);
    res.json({ asset: updated });
  } catch (e: any) {
    console.error('[revert] failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'revert failed' });
  }
});

app.patch('/api/text2image/assets/:id/name', async (req, res) => {
  const { name } = req.body as { name?: string };
  if (typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  try {
    await renameAsset(req.params.id, name.trim());
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/text2image/assets/:id', async (req, res) => {
  try {
    await deleteAsset(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/limits', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const lim = await checkRateLimit(email);
  res.json({
    used24h: lim.used,
    limit24h: lim.limit === Infinity ? null : lim.limit,
    isAdmin: isAdminEmail(email),
  });
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!req.file) return res.status(400).json({ error: 'image required' });

  // Enforce free-tier rate limit before paying for R2 upload
  const lim = await checkRateLimit(email);
  if (!lim.ok) {
    return res.status(429).json({
      error: 'rate_limited',
      detail: `Free tier limit reached (${lim.used}/${lim.limit} in last 24 h). Try again later.`,
      used24h: lim.used,
      limit24h: lim.limit,
    });
  }

  try {
    // Strip the background BEFORE uploading. Hunyuan3D's internal rembg
    // step is unreliable on dark/black backgrounds — doing it here with a
    // controlled model means the worker always gets a clean alpha-masked
    // PNG. Failure is non-fatal: we fall back to the original buffer.
    // Caller can opt out with skipBgRemoval=true (e.g. for debugging or
    // when the source is already a cutout).
    const skipBg =
      req.body.skipBgRemoval === 'true' || req.body.skipBgRemoval === true;
    let buf = req.file.buffer;
    let originalName = req.file.originalname;
    let mimetype = req.file.mimetype;
    let qcWarnings: string[] = [];
    if (!skipBg) {
      const stripped = await stripBackground(req.file.buffer, req.file.mimetype);
      if (stripped.ok) {
        // Gate on subject quality BEFORE we burn GPU time. Errors are
        // hard-rejects (we'd just produce a bad mesh); warnings flow back
        // to the client so the UI can surface them.
        if (stripped.stats) {
          const qc = qualityCheck(stripped.stats);
          if (!qc.ok) {
            return res.status(422).json({
              error: 'image_not_suitable',
              detail: qc.errors.join(' '),
              errors: qc.errors,
              warnings: qc.warnings,
              stats: stripped.stats,
            });
          }
          qcWarnings = qc.warnings;
        }
        buf = stripped.buffer;
        mimetype = stripped.mimetype;
        // Force .png extension — the cutout has an alpha channel, so JPEG
        // would silently drop transparency and re-introduce a background.
        originalName = req.file.originalname.replace(/\.[^.]+$/, '') + '.png';
      }
    }

    const { url } = await uploadToR2(buf, originalName, mimetype);
    const job = await createJob({
      userEmail:     email,
      imageUrl:      url,
      name:          req.body.name          || '',
      prompt:        req.body.prompt        || '',
      style:         req.body.style         || 'Realistic',
      polygonBudget:    req.body.polygonBudget || 'Medium (50k-200k)',
      textureRes:       req.body.textureRes    || '1K',
      exportFormat:     req.body.exportFormat  || 'GLB',
      detailLevel:      req.body.detailLevel   || 'Standard',
      doTexture:        req.body.doTexture === 'true' || req.body.doTexture === true,
      octreeResolution: parseInt(req.body.octreeResolution) || 0,
      targetFaceCount:  parseInt(req.body.targetFaceCount)  || 0,
      inferenceSteps:   parseInt(req.body.inferenceSteps)   || 0,
      guidanceScale:    parseFloat(req.body.guidanceScale)  || 0,
      numChunks:        parseInt(req.body.numChunks)        || 0,
      seed:             parseInt(req.body.seed)             || 0,
    });
    res.json({ job, warnings: qcWarnings });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  res.json({ jobs: await getJobsByUser(email) });
});

// Submit a 3D job re-using an existing R2 upload key. Lets the user pick
// from the gallery of already-uploaded inputs and start a fresh 3D run
// without re-uploading the same bytes. Body: { email, key, name, ...params }.
app.post('/api/jobs/from-key', async (req, res) => {
  const { email, key, name, prompt } = req.body as {
    email?: string; key?: string; name?: string; prompt?: string;
  };
  if (!email || !key) return res.status(400).json({ error: 'email + key required' });

  const lim = await checkRateLimit(email);
  if (!lim.ok) {
    return res.status(429).json({
      error: 'rate_limited',
      detail: `Free tier limit reached (${lim.used}/${lim.limit} in last 24 h).`,
      used24h: lim.used, limit24h: lim.limit,
    });
  }

  const bucket = process.env.R2_BUCKET || 'genshape3d';
  const publicUrl = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${bucket}`;
  const url = `${publicUrl}/${key}`;
  try {
    const job = await createJob({
      userEmail: email,
      imageUrl: url,
      name: name || '',
      prompt: prompt || '',
      style: 'Realistic',
      polygonBudget: 'Low (10k-50k)',
      textureRes: '1K',
      exportFormat: 'GLB',
      detailLevel: 'Standard',
      doTexture: req.body.doTexture === true || req.body.doTexture === 'true',
      octreeResolution: parseInt(req.body.octreeResolution) || 256,
      targetFaceCount:  parseInt(req.body.targetFaceCount)  || 30000,
      inferenceSteps:   parseInt(req.body.inferenceSteps)   || 5,
      guidanceScale:    parseFloat(req.body.guidanceScale)  || 5,
      numChunks:        parseInt(req.body.numChunks)        || 0,
      seed:             parseInt(req.body.seed)             || 0,
    });
    res.json({ job });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Re-link a job's input thumbnail to a different R2 upload. Used by the
// "pick a thumbnail" UI for recovered jobs whose original input pairing
// was lost or auto-matched incorrectly.
app.patch('/api/jobs/:id/image-url', async (req, res) => {
  const { imageUrl } = req.body as { imageUrl?: string };
  if (typeof imageUrl !== 'string') return res.status(400).json({ error: 'imageUrl required' });
  try {
    const { getDb } = require('./db');
    await getDb().query(
      `UPDATE genshape3d_jobs SET "imageUrl" = $1, "updatedAt" = $2 WHERE id = $3`,
      [imageUrl, new Date().toISOString(), req.params.id],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List every input image in R2 (uploads/) so the UI can show a picker.
// Returns { uploads: [{ key, url, lastModified, size }] } newest first.
app.get('/api/uploads', async (req, res) => {
  try {
    const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: true,
    });
    const bucket = process.env.R2_BUCKET || 'genshape3d';
    const publicUrl = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${bucket}`;

    const all: { key: string; url: string; lastModified: string; size: number }[] = [];
    let token: string | undefined;
    do {
      const r = await s3.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: 'uploads/', ContinuationToken: token, MaxKeys: 1000,
      }));
      for (const o of r.Contents || []) {
        all.push({
          key: o.Key,
          url: `${publicUrl}/${o.Key}`,
          lastModified: o.LastModified?.toISOString() || '',
          size: o.Size || 0,
        });
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);

    all.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    res.json({ uploads: all });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await deleteJob(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/jobs/:id/name', async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try {
    await renameJob(req.params.id, name.trim());
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/jobs/:id/cancel', async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    await cancelJob(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Generate ──────────────────────────────────────────────────────────────────

app.post('/api/generate', async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  const ok = await deductCredit(email);
  if (!ok) return res.status(402).json({ error: 'Insufficient credits' });
  res.json({ ok: true, status: 'queued' });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/api/mgmt/users', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ users: await listAppUsers() });
});

app.patch('/api/mgmt/users/:id/role', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { role } = req.body as { role: UserRole };
  const validRoles: UserRole[] = ['free', 'pro', 'admin'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await setUserRole(req.params.id, role);
  res.json({ ok: true });
});

app.get('/api/admin/jobs', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const filter = req.query.filter as string;
  const jobs = filter === 'pending' ? await listPendingJobs()
    : filter === 'cancelled' ? await listCancelledJobs()
    : await listAllJobs();
  res.json({ jobs });
});

app.patch('/api/admin/jobs/:id/status', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });
  const { status, resultUrl } = req.body as { status: string; resultUrl?: string };
  await updateJobStatus(req.params.id as any, status as any, resultUrl);
  res.json({ ok: true });
});

// ── Stats (admin) ────────────────────────────────────────────────────────────
// Aggregate usage data for the admin dashboard. Read-only, single round-trip.

app.get('/api/admin/stats', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !isAdminEmail(caller)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const { getDb } = require('./db');
    const db = getDb();

    // Totals + status breakdown
    const totals = await db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM genshape3d_jobs
      GROUP BY status
    `);

    // Per-day counts for the last 14 days
    const byDay = await db.query(`
      SELECT
        DATE("createdAt"::timestamptz AT TIME ZONE 'UTC') AS day,
        COUNT(*)::int AS submitted,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::int AS done,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
      FROM genshape3d_jobs
      WHERE "createdAt"::timestamptz > NOW() - INTERVAL '14 days'
      GROUP BY day
      ORDER BY day DESC
    `);

    // Avg / median / p95 run-time (seconds) over last 30 days
    const timing = await db.query(`
      WITH t AS (
        SELECT EXTRACT(EPOCH FROM ("completedAt"::timestamptz - "startedAt"::timestamptz)) AS run_s,
               "doTexture" AS tex,
               "inferenceSteps" AS steps
        FROM genshape3d_jobs
        WHERE status = 'done'
          AND "completedAt" IS NOT NULL
          AND "startedAt" IS NOT NULL
          AND "completedAt" > NOW() - INTERVAL '30 days'
      )
      SELECT
        COUNT(*)::int AS n,
        ROUND(AVG(run_s))::int AS avg_s,
        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY run_s))::int AS p50_s,
        ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY run_s))::int AS p95_s,
        tex,
        CASE WHEN steps > 10 THEN 'high' ELSE 'standard' END AS quality
      FROM t
      GROUP BY tex, quality
      ORDER BY quality, tex
    `);

    // Users + signups
    const users = await db.query(`
      SELECT
        COUNT(*)::int AS total_users,
        SUM(CASE WHEN "createdAt"::timestamptz > NOW() - INTERVAL '7 days'  THEN 1 ELSE 0 END)::int AS new_7d,
        SUM(CASE WHEN "createdAt"::timestamptz > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int AS new_24h
      FROM genshape3d_users
    `);

    // Active users (submitted at least one job in last 7 / 24h)
    const active = await db.query(`
      SELECT
        COUNT(DISTINCT "userEmail") FILTER (WHERE "createdAt"::timestamptz > NOW() - INTERVAL '7 days')::int  AS active_7d,
        COUNT(DISTINCT "userEmail") FILTER (WHERE "createdAt"::timestamptz > NOW() - INTERVAL '24 hours')::int AS active_24h
      FROM genshape3d_jobs
    `);

    // Current queue depth (jobs not yet finished)
    const queue = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int    AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
      FROM genshape3d_jobs
    `);

    // Recent generations — who, when, what (last 30 days, up to 500 rows).
    // Client filters by time range / status / quality; we send everything once.
    const recent = await db.query(`
      SELECT
        id,
        "userEmail"     AS email,
        status,
        "createdAt"     AS submitted_at,
        "startedAt"     AS started_at,
        "completedAt"   AS completed_at,
        "inferenceSteps" AS steps,
        "octreeResolution" AS octree,
        "doTexture"     AS tex
      FROM genshape3d_jobs
      WHERE "createdAt"::timestamptz > NOW() - INTERVAL '30 days'
      ORDER BY "createdAt" DESC
      LIMIT 500
    `);

    res.json({
      generatedAt: new Date().toISOString(),
      byStatus: totals.rows,
      byDay: byDay.rows,
      timing: timing.rows,
      users: users.rows[0],
      active: active.rows[0],
      queue: queue.rows[0],
      recent: recent.rows,
    });
  } catch (e: any) {
    console.error('[admin/stats]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

initDb().then(() => {
  app.listen(port, () => console.log(`GenShape3D API listening on http://localhost:${port}`));
  // Pre-load the rembg ONNX model so the first /api/upload doesn't pay the
  // ~3s cold-start cost. Best-effort — failures are logged inside warmRembg.
  warmRembg();
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});
