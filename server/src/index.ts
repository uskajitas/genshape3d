import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs';
import path from 'node:path';

// ─── Startup env-drift guard ─────────────────────────────────────────────────
// Parses .env.example, checks every key against process.env, and prints a
// LOUD warning if any are missing or empty. Catches drift the moment
// ts-node-dev reloads — instead of when a user hits a feature later.
(function envDriftGuard() {
  try {
    const examplePath = path.join(__dirname, '..', '.env.example');
    if (!fs.existsSync(examplePath)) return;
    const lines = fs.readFileSync(examplePath, 'utf8').split(/\r?\n/);
    const missing: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
      const val = process.env[key];
      if (val === undefined || val === '') missing.push(key);
    }
    if (missing.length > 0) {
      const bar = '─'.repeat(72);
      console.warn(`\n${bar}\n⚠️  WARNING: server/.env is missing ${missing.length} key(s) declared in .env.example:`);
      for (const k of missing) console.warn(`     ${k}`);
      console.warn(`   Features that depend on these will return errors.`);
      console.warn(`   Fix: append the value(s) to F:/cloudflare/genshape3d/server/.env\n${bar}\n`);
    }
  } catch (e: any) {
    console.warn('[env-drift-guard] check failed:', e?.message || e);
  }
})();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { initDb, getDb, dbQuery } from './db';
import {
  upsertOnLogin, recordLoginEvent, getAppUser,
  listAppUsers, setUserRole, deductCredit,
  isAdminEmail, isAdmin, UserRole,
} from './usersRepo';
import { uploadToR2, getR2Stream, presignR2Get } from './r2';
import { stripBackground, warmRembg, qualityCheck, runRembgOnly, hardenWithOptions } from './bgRemoval';
import { createJob, getJobById, getJobsByUser, listAllJobs, listPendingJobs, listCancelledJobs, updateJobStatus, cancelJob, renameJob, deleteJob, countUserJobsSince, archiveJob, unarchiveJob, archiveAllJobs, listArchivedJobs } from './jobsRepo';
import { createTextureJob, getTextureJobsByUser, getTextureJobsForSource } from './textureJobsRepo';
import { listPacks, createCheckout, stripeWebhook } from './billing';
import { createAsset, listAssetsByUser, renameAsset, deleteAsset, getAssetById, setAssetReadyFor3D, applyAssetEdit, revertAssetEdit, replaceAssetImageKey } from './text2imageRepo';
import { callMultiView, type MultiViewLabel } from './multiViewProvider';
import { mountWorkersApi } from './workersApi';
import {
  listRatingDimensions, addRatingDimension,
  getCategoryTree, listCategories,
  listSubjects, getSubject, createSubject, updateSubject, deleteSubject,
  listRuns, getRun, createRun, markRunComplete,
  getRunItems, createRunItems, rateRunItem, exportRun,
} from './benchmarkRepo';

const app = express();
const port = process.env.PORT || 8110;
const clientOrigin = process.env.CLIENT_ORIGIN_URL || 'http://localhost:3110';
// ugen3d loads heavy assets (GLBs, images) DIRECTLY from this API instead of
// relaying them through its own server — halves the tunnel bandwidth per
// model. Keep this list in sync with the ugen3d client's G3D_DIRECT base.
const allowedOrigins = [clientOrigin, 'https://ugen3d.com', 'http://localhost:3230'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
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

app.get('/files/:name', async (req, res) => {
  const m = /^([A-Za-z0-9_-]+)\.(bin|jpg|glb)$/.exec(req.params.name || '');
  if (!m) return res.status(400).json({ error: 'bad name' });
  let key = '';
  try { key = Buffer.from(m[1], 'base64url').toString('utf8'); }
  catch { return res.status(400).json({ error: 'bad name' }); }
  try {
    const obj = await getR2Stream(key);
    res.setHeader('Content-Type', m[2] === 'jpg' ? 'image/jpeg' : 'model/gltf-binary');
    // immutable — R2 keys are content-unique; lets Cloudflare edge-cache it
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
  if (await isAdmin(email)) return { ok: true, used: 0, limit: Infinity as any };
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
// Flux Schnell (4 steps) treats camera-angle words as soft hints and, because
// most subject prompts describe symmetric front-facing anatomy, drifts toward
// front. So these clauses are deliberately forceful/unambiguous, and each view
// also injects the COMPETING angles into the negative prompt (VIEW_NEGATIVE).
const VIEW_CLAUSE: Record<string, string> = {
  front:   'strict front view, the subject directly facing the camera head-on, fully frontal and symmetrical, camera at eye level',
  three_q: 'three-quarter view (3/4 view), the subject rotated about 45 degrees toward one side so BOTH its front and one side face the camera at the same time, the front of the subject clearly still visible but angled — the classic 3/4 product-shot angle, halfway between a straight-on front and a full side profile; for characters and creatures: FACING TOWARD the camera turned 45 degrees, face and chest fully visible, absolutely never seen from behind or over the shoulder',
  side:    'strict side profile view, the subject turned to face fully sideways (90 degrees), camera perpendicular to the subject so only one side is visible — NOT front-facing and NOT a 3/4 angle',
  back:    'strict back view, camera directly behind the subject, only the back is visible',
  top:     'strict top-down view, camera looking straight down from directly above the subject',
  bottom:  'strict bottom-up view, camera looking straight up from directly below the subject',
  none:    '',
};

// Competing angles to push OUT of frame for each selected view. Appended to the
// negative prompt so the model doesn't fall back to its front-facing default.
const VIEW_NEGATIVE: Record<string, string> = {
  front:   'three-quarter view, 3/4 view, side profile, back view, top-down view',
  three_q: 'front-facing, head-on frontal view, flat side profile, back view, seen from behind, over-the-shoulder view, back turned to camera, top-down view',
  side:    'front-facing, head-on frontal view, three-quarter view, 3/4 view, back view, top-down view',
  back:    'front-facing, three-quarter view, side profile, top-down view',
  top:     'front view, side view, eye-level view',
  bottom:  'front view, side view, eye-level view',
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

// NOTE on colour: subject prompts often describe only shape (no colour or
// material words). Without an explicit colour instruction the model fills the
// vacuum with neutral grey. So the colour-bearing styles (photoreal, toon) say
// "in full natural colour" outright. clay/neutral stay grey ON PURPOSE.
const STYLE_CLAUSE: Record<string, string> = {
  photoreal: 'studio product photography, photorealistic, in full natural colour, richly coloured with realistic material colours and finishes, tack sharp, crisp edges, high detail, 8k resolution',
  clay:      'matte clay render, smooth neutral surface, even lighting, sharp edges, crisp',
  neutral:   'flat shaded neutral material, no textures, even lighting, sharp, crisp',
  toon:      'toon-shaded 3D model render, clean cel shading, vibrant saturated colours, crisp outlines, sharp',
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
  const bg     = BG_CLAUSE[String(q.bg || 'white')]                  ?? BG_CLAUSE.white;
  const view   = VIEW_CLAUSE[String(q.view || 'three_q')]            ?? VIEW_CLAUSE.three_q;
  const proj   = PROJECTION_CLAUSE[String(q.projection || 'perspective')] ?? PROJECTION_CLAUSE.perspective;
  const scale  = SCALE_CLAUSE[String(q.scale || 'margin')]           ?? SCALE_CLAUSE.margin;
  const style  = STYLE_CLAUSE[String(q.style || 'photoreal')]        ?? STYLE_CLAUSE.photoreal;
  const mat    = MATERIAL_CLAUSE[String(q.material || 'auto')]       ?? '';

  // Order matters: Flux weights earlier tokens more, and Schnell ignores the
  // negative prompt entirely — so the camera VIEW goes right after the subject
  // line (before bg/style) to fight the front-facing default. It's also stated
  // once up front as its own emphatic clause.
  const parts: string[] = [
    strict ? `one single isolated ${userPrompt}, alone` : userPrompt,
  ];
  if (strict) parts.push('exactly one subject in frame, no other items');
  if (view) parts.push(view);

  for (const c of [bg, proj, scale, style, mat]) {
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

// ── Flux image-to-image caller (DEAD — kept for reference) ─────────────────
//
// Was used by the previous alt-views implementation. We replaced it with
// a real multi-view diffusion model (Zero123++) because Flux i2i can
// only re-paint an image, not rotate it. Kept here as a known-good
// reference shape if we ever wire up Flux Kontext or a similar
// instruction-following edit endpoint. Safe to delete when no longer
// useful.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Optional negative prompt — caller can add their own avoid-tokens. We also
  // inject the competing camera angles for the chosen view so the model is
  // pushed away from its front-facing default (unless raw=1 bypasses composition).
  const userNegative = String(req.query.negative || '').trim();
  const viewNegative = req.query.raw === '1'
    ? ''
    : (VIEW_NEGATIVE[String(req.query.view || 'three_q')] ?? '');
  const negative = [ALWAYS_NEGATIVE, viewNegative, userNegative].filter(Boolean).join(', ');

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
    //
    // benchmark=1 — image is for the benchmark section only. We still upload
    // to R2 so the URL is permanent, but we skip the createAsset() call so the
    // image never appears in the user's normal gallery.
    const email = String(req.query.email || '').trim();
    const isBenchmark = req.query.benchmark === '1';
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

        if (!isBenchmark) {
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
        }
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
    // signedUrl: direct-from-R2 image URL (edge-served) so clients skip the
    // slow tunnel streaming path. Signing is local crypto — effectively free.
    const signed = await Promise.all(assets.map(async (a) => ({
      ...a,
      signedUrl: a.imageKey ? await presignR2Get(a.imageKey).catch(() => '') : '',
    })));
    res.json({ assets: signed });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Generate alt views via a TRUE multi-view diffusion model (Zero123++ on
// Replicate by default). One model call returns up to 6 consistent views
// of the same subject — we map them onto our internal view labels and
// persist them as alt-view asset rows linked to the parent.
//
// Behaviours, depending on body shape:
//   { email, parentAssetId }                 → BATCH: fill all missing
//                                              alt views (skip ones that
//                                              already exist). Returns
//                                              { views: [...] }
//   { email, parentAssetId, viewLabel }      → SINGLE: regenerate that
//                                              one view (replace its
//                                              image_key in place if it
//                                              already exists; create if
//                                              not). Returns { asset }.
//
// The previous Flux-i2i implementation is gone — it could never reliably
// rotate a subject. See server/src/multiViewProvider.ts for the model
// integration.
app.post('/api/text2image/alt-views', async (req, res) => {
  const { email, parentAssetId, viewLabel } = req.body as {
    email?: string; parentAssetId?: string; viewLabel?: string;
  };
  if (!email)         return res.status(400).json({ error: 'email required' });
  if (!parentAssetId) return res.status(400).json({ error: 'parentAssetId required' });

  const ALL_LABELS: MultiViewLabel[] = ['three_q', 'side', 'back', 'top', 'bottom'];
  if (viewLabel && !ALL_LABELS.includes(viewLabel as MultiViewLabel) && viewLabel !== 'front') {
    return res.status(400).json({ error: `unknown viewLabel: ${viewLabel}` });
  }

  try {
    const parent = await getAssetById(parentAssetId, email);
    if (!parent) return res.status(404).json({ error: 'parent asset not found' });
    if (viewLabel && parent.viewLabel === viewLabel) {
      return res.status(409).json({ error: `parent is already a ${viewLabel} view` });
    }

    // Existing alt views for this parent — used by BATCH mode to skip
    // already-filled slots, and by SINGLE mode to know whether we're
    // creating a new row or replacing an existing one's image_key.
    const allAssets = await listAssetsByUser(email);
    const siblings = allAssets.filter(a => a.parentAssetId === parent.id);

    // Pull the parent image bytes from R2.
    const r2Result = await getR2Stream(parent.imageKey);
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of r2Result.Body as any) chunks.push(Buffer.from(chunk));
    const sourceBytes = Buffer.concat(chunks);
    const sourceMime  = r2Result.ContentType || 'image/jpeg';

    console.log(
      `[alt-views] ${viewLabel ? 'single ' + viewLabel : 'batch'} for parent=${parent.id.slice(0, 8)}, calling MV provider…`,
    );
    const mvViews = await callMultiView(sourceBytes, sourceMime);
    console.log(`[alt-views] MV provider returned ${mvViews.length} views: [${mvViews.map(v => v.label).join(', ')}]`);

    // ── SINGLE-VIEW path (regen one slot) ─────────────────────────────
    if (viewLabel) {
      const target = mvViews.find(v => v.label === viewLabel);
      if (!target) {
        return res.status(501).json({
          error: `view '${viewLabel}' is not available from the multi-view model. ` +
            `Zero123++ does not produce top/bottom directly.`,
        });
      }
      const ext = target.contentType.includes('png') ? '.png' : '.jpg';
      const filename = `t2i-${viewLabel}-${Date.now()}${ext}`;
      const uploaded = await uploadToR2(target.bytes, filename, target.contentType);

      const existing = siblings.find(s => s.viewLabel === viewLabel);
      if (existing) {
        await replaceAssetImageKey(existing.id, uploaded.key);
        const refreshed = await getAssetById(existing.id, email);
        return res.json({ asset: refreshed });
      }
      const asset = await createAsset({
        userEmail:     email,
        name:          `${parent.name} (${viewLabel})`,
        prompt:        parent.prompt,
        finalPrompt:   parent.finalPrompt,
        params:        parent.params,
        provider:      'replicate-zero123',
        imageKey:      uploaded.key,
        seed:          null,
        parentAssetId: parent.id,
        viewLabel,
        readyFor3D:    true,
      });
      return res.json({ asset });
    }

    // ── BATCH path: fill every missing slot ──────────────────────────
    const filledLabels = new Set(siblings.map(s => s.viewLabel).concat([parent.viewLabel || '']));
    const created: any[] = [];
    for (const v of mvViews) {
      if (filledLabels.has(v.label)) continue;
      const ext = v.contentType.includes('png') ? '.png' : '.jpg';
      const filename = `t2i-${v.label}-${Date.now()}${ext}`;
      const uploaded = await uploadToR2(v.bytes, filename, v.contentType);
      const asset = await createAsset({
        userEmail:     email,
        name:          `${parent.name} (${v.label})`,
        prompt:        parent.prompt,
        finalPrompt:   parent.finalPrompt,
        params:        parent.params,
        provider:      'replicate-zero123',
        imageKey:      uploaded.key,
        seed:          null,
        parentAssetId: parent.id,
        viewLabel:     v.label,
        readyFor3D:    true,
      });
      created.push(asset);
    }
    res.json({ views: created });
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

// In-memory cache of rembg "raw" outputs (RGBA PNG with soft alpha)
// keyed by `${userEmail}:${assetId}`. The slow part of background
// removal is the U2-Net pass (~2-3s). hardenAlpha — the threshold +
// erosion + fill step — is ~50ms. By caching the rembg result we can
// re-harden on every slider tweak in the BgRemovalDialog without
// running rembg again, giving the user live feedback.
//
// Capacity: keep at most 32 entries (each ~1MB). LRU-ish eviction by
// re-insertion order. 30-minute TTL ensures stale entries don't pile up.
const REMBG_CACHE = new Map<string, { png: Buffer; ts: number }>();
const REMBG_CACHE_MAX = 32;
const REMBG_CACHE_TTL_MS = 30 * 60 * 1000;
function rembgCacheGet(key: string): Buffer | null {
  const e = REMBG_CACHE.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > REMBG_CACHE_TTL_MS) {
    REMBG_CACHE.delete(key);
    return null;
  }
  // Bump to "most recent" by re-inserting.
  REMBG_CACHE.delete(key);
  REMBG_CACHE.set(key, e);
  return e.png;
}
function rembgCachePut(key: string, png: Buffer): void {
  REMBG_CACHE.set(key, { png, ts: Date.now() });
  while (REMBG_CACHE.size > REMBG_CACHE_MAX) {
    const oldest = REMBG_CACHE.keys().next().value;
    if (!oldest) break;
    REMBG_CACHE.delete(oldest);
  }
}

// Live preview endpoint for the BgRemovalDialog — returns the bytes
// for the current slider settings WITHOUT persisting the edit. First
// call warms the rembg cache; subsequent calls (different slider
// positions) re-harden the cached buffer in ~50ms.
//
// Returns image/png bytes directly so the client can drop them into an
// <img src="data:..."> or an object URL.
app.post('/api/text2image/assets/:id/preview-bg', async (req, res) => {
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

    // Always preview from the ORIGINAL — same source as edit-bg uses.
    const sourceKey = asset.originalImageKey || asset.imageKey;
    const cacheKey = `${email}:${asset.id}`;

    let rawRembg = rembgCacheGet(cacheKey);
    if (!rawRembg) {
      const r2Result = await getR2Stream(sourceKey);
      const chunks: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of r2Result.Body as any) chunks.push(Buffer.from(chunk));
      const sourceBytes = Buffer.concat(chunks);
      const sourceMime  = r2Result.ContentType || 'image/jpeg';
      rawRembg = await runRembgOnly(sourceBytes, sourceMime);
      rembgCachePut(cacheKey, rawRembg);
    }

    const { buffer } = await hardenWithOptions(rawRembg, opts);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (e: any) {
    console.error('[preview-bg] failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'preview-bg failed' });
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
    isAdmin: await isAdmin(email),
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
      useMultiView:     req.body.useMultiView === 'true' || req.body.useMultiView === true,
      autoRefine:       req.body.autoRefine === 'true' || req.body.autoRefine === true,
      octreeResolution: parseInt(req.body.octreeResolution) || 0,
      targetFaceCount:  parseInt(req.body.targetFaceCount)  || 0,
      inferenceSteps:   parseInt(req.body.inferenceSteps)   || 0,
      guidanceScale:    parseFloat(req.body.guidanceScale)  || 0,
      numChunks:        parseInt(req.body.numChunks)        || 0,
      seed:             parseInt(req.body.seed)             || 0,
      model:            (req.body.model as string)          || 'hunyuan3d',
      // Admin-only: pin job to a specific worker. Non-admins always get ''.
      preferredWorkerId: (await isAdmin(email)) ? (req.body.preferredWorkerId || '') : '',
      groupId:          (req.body.groupId as string)         || null,
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
  const jobs = await getJobsByUser(email);
  // Edge-served URLs so thumbnails and GLB downloads skip the tunnel.
  const toKey = (u: string) => {
    if (!u.startsWith('http')) return u;
    const marker = `/${process.env.R2_BUCKET || 'genshape3d'}/`;
    const idx = u.indexOf(marker);
    return idx === -1 ? u : u.slice(idx + marker.length);
  };
  const signed = await Promise.all(jobs.map(async (j: any) => ({
    ...j,
    thumbSignedUrl: j.thumbUrl ? await presignR2Get(toKey(j.thumbUrl)).catch(() => '') : '',
    resultSignedUrl: j.resultUrl ? await presignR2Get(toKey(j.resultUrl)).catch(() => '') : '',
    previewSignedUrl: j.previewUrl ? await presignR2Get(toKey(j.previewUrl)).catch(() => '') : '',
    // Cloudflare-edge-cacheable path (no bucket CORS needed): first fetch
    // streams once through the tunnel, then it's cached at the edge.
    previewFileUrl: j.previewUrl
      ? `https://api.genshape3d.com/files/${Buffer.from(toKey(j.previewUrl)).toString('base64url')}.bin`
      : '',
    thumbFileUrl: j.thumbUrl
      ? `https://api.genshape3d.com/files/${Buffer.from(toKey(j.thumbUrl)).toString('base64url')}.jpg`
      : '',
  })));
  res.json({ jobs: signed });
});

app.get('/api/textures', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  const sourceJobId = String(req.query.sourceJobId || '').trim();
  const textureJobs = sourceJobId
    ? await getTextureJobsForSource(sourceJobId, email)
    : await getTextureJobsByUser(email);
  res.json({ textureJobs });
});

app.post('/api/textures', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });

  const sourceJobId = String(req.body?.sourceJobId || '').trim();
  if (!sourceJobId) return res.status(400).json({ error: 'sourceJobId required' });

  const source = await getJobById(sourceJobId);
  if (!source) return res.status(404).json({ error: 'source job not found' });
  if (source.status !== 'done' || !source.resultUrl) {
    return res.status(409).json({ error: 'source model is not ready' });
  }
  if (source.userEmail !== email && !(await isAdmin(email))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const textureJob = await createTextureJob({
      userEmail: email,
      sourceJobId: source.id,
      sourceModelUrl: String(req.body?.sourceModelUrl || source.resultUrl),
      prompt: String(req.body?.prompt || '').trim(),
      materialPreset: String(req.body?.materialPreset || 'Auto'),
      referenceImageKey: String(req.body?.referenceImageKey || ''),
      textureRes: String(req.body?.textureRes || '2K'),
      maps: Array.isArray(req.body?.maps) ? req.body.maps.map(String) : undefined,
      variants: parseInt(req.body?.variants) || 1,
      seed: parseInt(req.body?.seed) || 0,
      strength: parseInt(req.body?.strength) || 65,
      keepShape: req.body?.keepShape !== false,
      sourceImageUrl: source.imageUrl,
    });
    res.json({ textureJob });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Mesh refine jobs ─────────────────────────────────────────────────────────
// Repair + retopology of a generated mesh. Runs on the 3090 worker (direct
// DB polling, same as texture jobs); completion inserts a derivative
// genshape3d_jobs row so the clean mesh shows up as a normal asset.

app.post('/api/refine', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  const sourceJobId = String(req.body?.sourceJobId || '').trim();
  if (!sourceJobId) return res.status(400).json({ error: 'sourceJobId required' });

  const source = await getJobById(sourceJobId);
  if (!source) return res.status(404).json({ error: 'source job not found' });
  if (source.status !== 'done' || !source.resultUrl) {
    return res.status(409).json({ error: 'source model is not ready' });
  }
  if (source.userEmail !== email && !(await isAdmin(email))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ops = req.body?.operations || {};
  const operations = {
    targetFaces: Math.max(0, parseInt(ops.targetFaces) || 0),
    fillHoles: ops.fillHoles !== false,
    smooth: Math.max(0, Math.min(20, parseInt(ops.smooth) || 0)),
    keepFrac: 0.02,
    // true = Poisson surface rebuild (discard original topology entirely)
    rebuild: ops.rebuild === true,
  };
  try {
    const id = randomUUID();
    const { rows } = await dbQuery(
      `INSERT INTO genshape3d_refine_jobs
         (id, "userEmail", "sourceJobId", "sourceModelUrl", operations)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, email, source.id, source.resultUrl, JSON.stringify(operations)],
    );
    res.json({ refineJob: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/refine', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  const sourceJobId = String(req.query.sourceJobId || '').trim();
  try {
    const { rows } = await dbQuery(
      sourceJobId
        ? `SELECT * FROM genshape3d_refine_jobs
           WHERE "userEmail" = $1 AND "sourceJobId" = $2 AND deleted = false
           ORDER BY "createdAt" DESC`
        : `SELECT * FROM genshape3d_refine_jobs
           WHERE "userEmail" = $1 AND deleted = false
           ORDER BY "createdAt" DESC LIMIT 50`,
      sourceJobId ? [email, sourceJobId] : [email],
    );
    res.json({ refineJobs: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/refine/:id', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { rows } = await dbQuery(
      `SELECT * FROM genshape3d_refine_jobs WHERE id = $1 AND deleted = false`, [req.params.id],
    );
    const job = rows[0];
    if (!job) return res.status(404).json({ error: 'not found' });
    if (job.userEmail !== email && !(await isAdmin(email))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await dbQuery(
      `UPDATE genshape3d_refine_jobs SET deleted = true, "updatedAt" = NOW() WHERE id = $1`,
      [req.params.id],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete (soft) a texture variant — owner or admin only.
app.delete('/api/textures/:id', async (req, res) => {
  const email = String(req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { getTextureJobById, deleteTextureJob } = await import('./textureJobsRepo');
    const job = await getTextureJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not found' });
    if (job.userEmail !== email && !(await isAdmin(email))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await deleteTextureJob(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Worker polls for pending texture jobs
app.get('/api/textures/pending', async (req, res) => {
  const workerId = req.query.workerId as string;
  if (!workerId) return res.status(400).json({ error: 'workerId required' });
  try {
    const { rows } = await dbQuery(
      `UPDATE genshape3d_texture_jobs
       SET status='processing', "assignedWorkerId"=$1, "startedAt"=NOW(), "updatedAt"=NOW()
       WHERE id = (
         SELECT id FROM genshape3d_texture_jobs
         WHERE status='pending' AND deleted=false
         ORDER BY "createdAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [workerId]
    );
    res.json({ job: rows[0] || null });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Worker reports progress
app.patch('/api/textures/:id/progress', async (req, res) => {
  const { pct, phase } = req.body;
  try {
    await dbQuery(
      `UPDATE genshape3d_texture_jobs SET "progressPct"=$1, "progressPhase"=$2, "updatedAt"=NOW() WHERE id=$3`,
      [pct ?? 0, phase ?? '', req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Worker completes job
app.patch('/api/textures/:id/complete', async (req, res) => {
  const { resultUrl } = req.body;
  try {
    await dbQuery(
      `UPDATE genshape3d_texture_jobs SET status='done', "resultUrl"=$1, "progressPct"=100, "progressPhase"='done', "completedAt"=NOW(), "updatedAt"=NOW() WHERE id=$2`,
      [resultUrl, req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Worker fails job
app.patch('/api/textures/:id/fail', async (req, res) => {
  const { error } = req.body;
  try {
    await dbQuery(
      `UPDATE genshape3d_texture_jobs SET status='failed', "errorMessage"=$1, "completedAt"=NOW(), "updatedAt"=NOW() WHERE id=$2`,
      [String(error || '').slice(0, 4000), req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/jobs/:id/texture-rerun', async (req, res) => {
  const email = req.body.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });

  const source = await getJobById(req.params.id);
  if (!source) return res.status(404).json({ error: 'source job not found' });
  if (source.status !== 'done') return res.status(409).json({ error: 'source job is not finished yet' });
  if (source.userEmail !== email && !(await isAdmin(email))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const lim = await checkRateLimit(email);
  if (!lim.ok) {
    return res.status(429).json({
      error: 'rate_limited',
      detail: `Free tier limit reached (${lim.used}/${lim.limit} in last 24 h).`,
      used24h: lim.used, limit24h: lim.limit,
    });
  }

  const texturePrompt = String(req.body.texturePrompt || '').trim();
  const promptParts = [
    source.prompt?.trim(),
    texturePrompt ? `Texture/material direction: ${texturePrompt}` : '',
  ].filter(Boolean);

  try {
    const job = await createJob({
      userEmail: email,
      imageUrl: source.imageUrl,
      name: `${source.name || 'Asset'} textured`,
      prompt: promptParts.join('\n'),
      style: source.style || 'Realistic',
      polygonBudget: source.polygonBudget || 'Low (10k-50k)',
      textureRes: String(req.body.textureRes || source.textureRes || '1K'),
      exportFormat: source.exportFormat || 'GLB',
      detailLevel: 'Standard',
      doTexture: true,
      useMultiView: source.useMultiView,
      octreeResolution: parseInt(req.body.octreeResolution) || source.octreeResolution || 256,
      targetFaceCount:  parseInt(req.body.targetFaceCount)  || source.targetFaceCount  || 30000,
      inferenceSteps:   parseInt(req.body.inferenceSteps)   || source.inferenceSteps   || 5,
      guidanceScale:    parseFloat(req.body.guidanceScale)  || source.guidanceScale    || 5,
      numChunks:        parseInt(req.body.numChunks)        || source.numChunks        || 0,
      seed:             parseInt(req.body.seed)             || 0,
      model:            (req.body.model as string)          || source.model || 'hunyuan3d',
      preferredWorkerId: (await isAdmin(email)) ? (req.body.preferredWorkerId || '') : '',
      auxImageUrls: Array.isArray((source as any).auxImageUrls) ? (source as any).auxImageUrls : [],
    });
    res.json({ job });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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

  // ─── Multi-view plumbing (hidden from the user) ────────────────────
  // Look up the text2image parent asset for this image key. If it has
  // alt-view children (front + side + back generated by Zero123++),
  // pass their URLs as auxImageUrls. The worker downloads them and
  // feeds them to Hunyuan3D-2-mv for multi-view conditioning.
  let auxImageUrls: string[] = [];
  try {
    const { getDb } = require('./db');
    const { rows: parents } = await dbQuery(
      `SELECT id FROM genshape3d_text2image_assets
        WHERE image_key = $1 AND deleted = false LIMIT 1`,
      [key],
    );
    const parentId = parents[0]?.id as string | undefined;
    if (parentId) {
      const { rows: kids } = await dbQuery(
        `SELECT image_key FROM genshape3d_text2image_assets
          WHERE "parentAssetId" = $1 AND deleted = false
          ORDER BY created_at ASC`,
        [parentId],
      );
      auxImageUrls = kids
        .map((r: any) => r.image_key as string)
        .filter(Boolean)
        .map((k: string) => `${publicUrl}/${k}`);
      if (auxImageUrls.length > 0) {
        console.log(`[jobs/from-key] attaching ${auxImageUrls.length} aux view(s) from parent ${parentId}`);
      }
    }
  } catch (e: any) {
    console.warn(`[jobs/from-key] aux-view lookup failed for key=${key}: ${e.message}`);
  }

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
      useMultiView: req.body.useMultiView === true || req.body.useMultiView === 'true',
      octreeResolution: parseInt(req.body.octreeResolution) || 256,
      targetFaceCount:  parseInt(req.body.targetFaceCount)  || 30000,
      inferenceSteps:   parseInt(req.body.inferenceSteps)   || 5,
      guidanceScale:    parseFloat(req.body.guidanceScale)  || 5,
      numChunks:        parseInt(req.body.numChunks)        || 0,
      seed:             parseInt(req.body.seed)             || 0,
      model:            (req.body.model as string)          || 'hunyuan3d',
      auxImageUrls,
      groupId:          (req.body.groupId as string)         || null,
    });
    res.json({ job, auxViewsAttached: auxImageUrls.length });
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
    await dbQuery(
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

// List archived jobs (admin only) — MUST be before /api/jobs/:id so Express
// doesn't treat "archived" as an ID parameter.
app.get('/api/jobs/archived', async (req, res) => {
  const email = req.query.email as string;
  if (!email || !(await isAdmin(email))) return res.status(403).json({ error: 'Forbidden' });
  try { res.json({ jobs: await listArchivedJobs(email) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Archive a single job (admin only)
app.patch('/api/jobs/:id/archive', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !(await isAdmin(email))) return res.status(403).json({ error: 'Forbidden' });
  try { await archiveJob(req.params.id); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Unarchive a single job (admin only)
app.patch('/api/jobs/:id/unarchive', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !(await isAdmin(email))) return res.status(403).json({ error: 'Forbidden' });
  try { await unarchiveJob(req.params.id); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Archive ALL current jobs for the user (admin only)
app.post('/api/jobs/archive-all', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !(await isAdmin(email))) return res.status(403).json({ error: 'Forbidden' });
  try {
    const count = await archiveAllJobs(email);
    res.json({ ok: true, count });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await deleteJob(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Model thumbnail — the client renders the GLB offscreen after generation
// and posts a PNG snapshot here. Stored once in R2; every jobs list from
// then on carries thumbUrl. Idempotent: re-posting replaces the thumb.
app.post('/api/jobs/:id/thumbnail', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const dataUrl = String(req.body?.dataUrl || '');
  if (!email) return res.status(400).json({ error: 'email required' });
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'dataUrl must be a base64 png/jpeg' });
  try {
    const job = await getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    if (job.userEmail !== email && !(await isAdmin(email))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'thumbnail too large' });
    // store the R2 KEY (not the full URL) so /api/image?key=… can serve it
    const uploaded = await uploadToR2(buf, `thumb-${job.id}.${m[1] === 'png' ? 'png' : 'jpg'}`, `image/${m[1]}`);
    const key = (uploaded as any).key || uploaded.url;
    await dbQuery(`UPDATE genshape3d_jobs SET "thumbUrl"=$1, "updatedAt"=NOW() WHERE id=$2`, [key, job.id]);
    res.json({ ok: true, thumbUrl: key });
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

// ── Asset groups (stylistically-related job batches) ─────────────────────────

app.get('/api/groups', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { listGroupsByUser } = await import('./groupsRepo');
    res.json({ groups: await listGroupsByUser(email) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/groups', async (req, res) => {
  const { email, name, styleAnchorUrl, notes } = req.body as {
    email?: string; name?: string; styleAnchorUrl?: string; notes?: string;
  };
  if (!email || !name?.trim()) return res.status(400).json({ error: 'email + name required' });
  try {
    const { createGroup } = await import('./groupsRepo');
    const group = await createGroup({
      userEmail: email,
      name: name.trim(),
      styleAnchorUrl: styleAnchorUrl || '',
      notes: notes || '',
    });
    res.json({ group });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/groups/:id', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { getGroup } = await import('./groupsRepo');
    const group = await getGroup(req.params.id);
    if (!group) return res.status(404).json({ error: 'not found' });
    if (group.userEmail !== email && !(await isAdmin(email))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows: jobs } = await dbQuery(
      `SELECT * FROM genshape3d_jobs
       WHERE "groupId" = $1 AND deleted = false
       ORDER BY "createdAt" DESC`,
      [req.params.id],
    );
    res.json({ group, jobs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/groups/:id', async (req, res) => {
  const { name, styleAnchorUrl } = req.body as { name?: string; styleAnchorUrl?: string };
  try {
    const { renameGroup, setGroupStyleAnchor } = await import('./groupsRepo');
    if (name?.trim()) await renameGroup(req.params.id, name.trim());
    if (typeof styleAnchorUrl === 'string') await setGroupStyleAnchor(req.params.id, styleAnchorUrl);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  try {
    const { deleteGroup } = await import('./groupsRepo');
    await deleteGroup(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Scenes ────────────────────────────────────────────────────────────────────

app.get('/api/scenes', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { listScenesByUser } = await import('./scenesRepo');
    res.json({ scenes: await listScenesByUser(email) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scenes', async (req, res) => {
  const { email, name } = req.body as { email?: string; name?: string };
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { createScene } = await import('./scenesRepo');
    const scene = await createScene(email, (name || '').trim() || 'Untitled scene');
    res.json({ scene });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/scenes/:id', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { getScene } = await import('./scenesRepo');
    const scene = await getScene(req.params.id);
    if (!scene) return res.status(404).json({ error: 'not found' });
    if (scene.userEmail !== email && !(await isAdmin(email))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ scene });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/scenes/:id', async (req, res) => {
  const { email, name, sceneData, thumbnailUrl } = req.body as {
    email?: string; name?: string; sceneData?: any; thumbnailUrl?: string;
  };
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { getScene, updateScene } = await import('./scenesRepo');
    const scene = await getScene(req.params.id);
    if (!scene) return res.status(404).json({ error: 'not found' });
    if (scene.userEmail !== email && !(await isAdmin(email))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await updateScene(req.params.id, { name, sceneData, thumbnailUrl });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/scenes/:id', async (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { getScene, deleteScene } = await import('./scenesRepo');
    const scene = await getScene(req.params.id);
    if (!scene) return res.status(404).json({ error: 'not found' });
    if (scene.userEmail !== email && !(await isAdmin(email))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await deleteScene(req.params.id);
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
  if (!caller || !(await isAdmin(caller))) return res.status(403).json({ error: 'Forbidden' });
  res.json({ users: await listAppUsers() });
});

app.patch('/api/mgmt/users/:id/role', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !(await isAdmin(caller))) return res.status(403).json({ error: 'Forbidden' });
  const { role } = req.body as { role: UserRole };
  const validRoles: UserRole[] = ['free', 'pro', 'admin'];
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await setUserRole(req.params.id, role);
  res.json({ ok: true });
});

app.get('/api/admin/jobs', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !(await isAdmin(caller))) return res.status(403).json({ error: 'Forbidden' });
  const filter = req.query.filter as string;
  const jobs = filter === 'pending' ? await listPendingJobs()
    : filter === 'cancelled' ? await listCancelledJobs()
    : await listAllJobs();
  res.json({ jobs });
});

// Full forensic trail for one job: the job row + its parent text2image
// asset (if any) + all alt-view siblings. Used by the admin "trail"
// panel in Workspace to see exactly what fed each 3D generation.
app.get('/api/admin/jobs/:id', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !(await isAdmin(caller))) return res.status(403).json({ error: 'Forbidden' });
  const { getDb } = require('./db');
  const { rows: jobRows } = await dbQuery(
    `SELECT * FROM genshape3d_jobs WHERE id = $1 LIMIT 1`,
    [req.params.id],
  );
  const job = jobRows[0];
  if (!job) return res.status(404).json({ error: 'not_found' });

  // Resolve the parent text2image asset by image_key (extracted from
  // the job's imageUrl). The site stores the row in
  // genshape3d_text2image_assets with image_key matching the path
  // portion after the bucket name.
  let parentAsset: any = null;
  let altViews: any[] = [];
  try {
    const bucket = process.env.R2_BUCKET || 'genshape3d';
    const u = new URL(job.imageUrl);
    const idx = u.pathname.indexOf(`/${bucket}/`);
    const key = idx >= 0 ? u.pathname.slice(idx + bucket.length + 2) : null;
    if (key) {
      const { rows: pr } = await dbQuery(
        `SELECT * FROM genshape3d_text2image_assets
          WHERE image_key = $1 AND deleted = false LIMIT 1`,
        [key],
      );
      parentAsset = pr[0] || null;
      if (parentAsset) {
        const { rows: kids } = await dbQuery(
          `SELECT id, image_key, "viewLabel", created_at
             FROM genshape3d_text2image_assets
            WHERE "parentAssetId" = $1 AND deleted = false
            ORDER BY created_at ASC`,
          [parentAsset.id],
        );
        altViews = kids;
      }
    }
  } catch { /* malformed URL or DB hiccup — return what we have */ }

  res.json({ job, parentAsset, altViews });
});

app.patch('/api/admin/jobs/:id/status', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !(await isAdmin(caller))) return res.status(403).json({ error: 'Forbidden' });
  const { status, resultUrl } = req.body as { status: string; resultUrl?: string };
  await updateJobStatus(req.params.id as any, status as any, resultUrl);
  res.json({ ok: true });
});

// ── Stats (admin) ────────────────────────────────────────────────────────────
// Aggregate usage data for the admin dashboard. Read-only, single round-trip.

app.get('/api/admin/stats', async (req, res) => {
  const caller = req.headers['x-user-email'] as string;
  if (!caller || !(await isAdmin(caller))) return res.status(403).json({ error: 'Forbidden' });

  try {
    const { getDb } = require('./db');
    const db = getDb();

    // Totals + status breakdown (benchmark jobs excluded throughout)
    const totals = await db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM genshape3d_jobs
      WHERE "isBenchmark" = false
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
        AND "isBenchmark" = false
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
          AND "isBenchmark" = false
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
      WHERE "isBenchmark" = false
    `);

    // Current queue depth (jobs not yet finished)
    const queue = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int    AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing
      FROM genshape3d_jobs
      WHERE "isBenchmark" = false
    `);

    // Recent generations — who, when, what (last 30 days, up to 500 rows).
    // Client filters by time range / status / quality; we send everything once.
    const recent = await db.query(`
      SELECT
        id,
        "userEmail"        AS email,
        name,
        "imageUrl"         AS image_url,
        model,
        "assignedWorkerId" AS worker,
        "preferredWorkerId" AS preferred_worker,
        status,
        "progressPct"      AS progress_pct,
        "progressPhase"    AS progress_phase,
        "errorMessage"     AS error_message,
        "createdAt"        AS submitted_at,
        "startedAt"        AS started_at,
        "completedAt"      AS completed_at,
        "inferenceSteps"   AS steps,
        "octreeResolution" AS octree,
        "doTexture"        AS tex
      FROM genshape3d_jobs
      WHERE "createdAt"::timestamptz > NOW() - INTERVAL '30 days'
        AND deleted = false
        AND "isBenchmark" = false
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

// ── Benchmark ─────────────────────────────────────────────────────────────────
// All routes are admin-only. The email must belong to an admin account.

const benchmarkAdminCheck = async (email: string | undefined, res: any): Promise<boolean> => {
  if (!email || !(await isAdmin(email))) {
    res.status(403).json({ error: 'admin only' });
    return false;
  }
  return true;
};

// Rating dimensions
app.get('/api/benchmark/dimensions', async (req, res) => {
  try { res.json(await listRatingDimensions()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/benchmark/dimensions', async (req, res) => {
  const { email, key, label, description } = req.body;
  if (!await benchmarkAdminCheck(email, res)) return;
  try { res.json(await addRatingDimension({ key, label, description })); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Categories
app.get('/api/benchmark/categories', async (_req, res) => {
  try { res.json(await getCategoryTree()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Subjects
app.get('/api/benchmark/subjects', async (_req, res) => {
  try { res.json(await listSubjects()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/benchmark/subjects/:id', async (req, res) => {
  try {
    const s = await getSubject(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(s);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/benchmark/subjects', async (req, res) => {
  const { email, ...data } = req.body;
  if (!await benchmarkAdminCheck(email, res)) return;
  try { res.json(await createSubject(data)); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/benchmark/subjects/:id', async (req, res) => {
  const { email, ...data } = req.body;
  if (!await benchmarkAdminCheck(email, res)) return;
  try { await updateSubject(req.params.id, data); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/benchmark/subjects/:id', async (req, res) => {
  const email = req.query.email as string;
  if (!await benchmarkAdminCheck(email, res)) return;
  try { await deleteSubject(req.params.id); res.json({ ok: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Runs
app.get('/api/benchmark/runs', async (_req, res) => {
  try { res.json(await listRuns()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/benchmark/runs/:id', async (req, res) => {
  try {
    const run = await getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'not found' });
    res.json(run);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/benchmark/runs/:id/items', async (req, res) => {
  try {
    const items = await getRunItems(req.params.id);
    const bucket = process.env.R2_BUCKET || 'genshape3d';
    // jobResultUrl is a raw private R2 URL — convert to proxied /api/image so the
    // browser can actually fetch it (and "View 3D" links open correctly).
    const proxyR2 = (url: string) => {
      if (url && url.includes(`.r2.cloudflarestorage.com/${bucket}/`)) {
        const key = url.split(`/${bucket}/`)[1];
        return `/api/image?key=${encodeURIComponent(key)}`;
      }
      return url;
    };
    const proxied = items.map(item => ({
      ...item,
      jobResultUrl: item.jobResultUrl ? proxyR2(item.jobResultUrl) : item.jobResultUrl,
      jobAuxImageUrls: Array.isArray((item as any).jobAuxImageUrls)
        ? (item as any).jobAuxImageUrls.map(proxyR2)
        : [],
    }));
    res.json(proxied);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/benchmark/runs/:id/export', async (req, res) => {
  try {
    const data = await exportRun(req.params.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="benchmark-${req.params.id}.json"`);
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Create a run: accepts { email, name, items: [{subjectId, model, preset, octree, steps, guidance, faces, chunks, seed}] }
// For each item it creates a real 3D job and stores the run item.
app.post('/api/benchmark/runs', async (req, res) => {
  const { email, name, items } = req.body as {
    email: string;
    name: string;
    items: Array<{
      subjectId: string;
      model: string;
      preset: string;
      octree: number; steps: number; guidance: number;
      faces: number; chunks: number; seed: number;
      doTexture?: boolean;
    }>;
  };
  if (!await benchmarkAdminCheck(email, res)) return;
  if (!name?.trim() || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'name and items required' });
  }

  try {
    const { createJob } = await import('./jobsRepo');
    const { getSubject } = await import('./benchmarkRepo');

    // Create the run record first
    const run = await createRun({
      name: name.trim(),
      configSnapshot: { items, createdBy: email },
    });

    const bucket    = process.env.R2_BUCKET     || 'genshape3d';
    const publicUrl = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${bucket}`;

    // Resolve a subject imageUrl to a full public URL the worker can download.
    // Quick Generate stores it as the relative /api/image?key=<key> form;
    // uploaded images come in as full https URLs already.
    const resolveImageUrl = (raw: string): string => {
      if (!raw) return raw;
      if (raw.startsWith('http')) return raw;                // already absolute
      const match = raw.match(/[?&]key=([^&]+)/);           // extract ?key=…
      if (match) return `${publicUrl}/${decodeURIComponent(match[1])}`;
      return raw;                                            // fallback unchanged
    };

    // For each item: fetch subject image, create a real job, create run item
    const runItems: any[] = [];
    for (const it of items) {
      const subject = await getSubject(it.subjectId);
      if (!subject) continue;

      // Texture only for models with a real paint step (Hunyuan3D-2 / 2.1).
      // Other models ignore doTexture at the runner, but we hard-gate here so
      // a stray flag can never flip on for them.
      const textureCapable = it.model === 'hunyuan3d' || it.model === 'hunyuan3d-2-1';
      const doTexture = textureCapable && it.doTexture === true;

      // Explicit worker routing for benchmark jobs — never rely on defaults.
      // Shape-only hunyuan3d (v2.0) runs on the i7-1080. TEXTURED jobs must
      // NOT go to the 1080 — its 8 GB card can't hold the paint pipeline and
      // hangs at "Loading model into VRAM" (see AGENT_1080_INSTRUCTIONS.md:
      // 1080 is mesh-only). Everything textured, and every other model, goes
      // to the 3090.
      const benchmarkWorker = it.model === 'hunyuan3d' && !doTexture ? 'i7-1080' : 'win-3090';

      const job = await createJob({
        userEmail: email,
        imageUrl: resolveImageUrl(subject.imageUrl),
        name: `[BM] ${subject.name} · ${it.model} · ${it.preset || 'custom'}${doTexture ? ' · tex' : ''}`,
        model: it.model,
        octreeResolution: it.octree,
        inferenceSteps: it.steps,
        guidanceScale: it.guidance,
        targetFaceCount: it.faces,
        numChunks: it.chunks,
        seed: it.seed,
        doTexture,
        isBenchmark: true,
        preferredWorkerId: benchmarkWorker,
      });

      runItems.push({ ...it, doTexture, jobId: job.id });
    }

    await createRunItems(run.id, runItems);
    res.json(run);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Rate a single run item
app.patch('/api/benchmark/items/:id/rate', async (req, res) => {
  const { email, ratings, ratingNotes } = req.body;
  if (!await benchmarkAdminCheck(email, res)) return;
  try {
    await rateRunItem(req.params.id, ratings, ratingNotes || '');
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Workers (multi-machine control plane) ────────────────────────────────────
// Registers /api/workers/register, /:id/claim, /:id/progress, /:id/complete,
// /:id/heartbeat (worker→server, bearer-auth) and GET /api/workers (admin).
mountWorkersApi(app);

// ── Stuck-job sweeper ─────────────────────────────────────────────────────────
// End-to-end guarantee that submitted jobs always reach a terminal state.
// The worker-side watchdog kills hung runners, but it can't fire if the worker
// process itself dies (crash, power loss, restart mid-job). This sweep runs on
// the server every 5 min:
//   - any job 'processing' whose updatedAt (bumped on every progress write and
//     claim) is >30 min old is presumed orphaned;
//   - requeued back to 'pending' up to 2 times ("requeueCount");
//   - after that it's marked failed so a poisoned job can't loop forever.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_STALE_MIN = parseInt(process.env.SWEEP_STALE_MINUTES || '30', 10);

async function sweepStuckJobs() {
  try {
    const { getDb } = require('./db');
    const db = getDb();
    const requeued = await db.query(
      `UPDATE genshape3d_jobs
          SET status='pending', "assignedWorkerId"='', "startedAt"=NULL,
              "progressPct"=0, "progressPhase"='requeued by sweeper (worker went silent)',
              "requeueCount" = COALESCE("requeueCount",0) + 1, "updatedAt"=NOW()
        WHERE status='processing'
          AND "updatedAt"::timestamptz < NOW() - ($1 || ' minutes')::interval
          AND COALESCE("requeueCount",0) < 2
        RETURNING id, name`,
      [SWEEP_STALE_MIN],
    );
    const failed = await db.query(
      `UPDATE genshape3d_jobs
          SET status='failed',
              "errorMessage"='gave up: worker went silent 3 times (sweeper)',
              "completedAt"=NOW(), "updatedAt"=NOW()
        WHERE status='processing'
          AND "updatedAt"::timestamptz < NOW() - ($1 || ' minutes')::interval
          AND COALESCE("requeueCount",0) >= 2
        RETURNING id, name`,
      [SWEEP_STALE_MIN],
    );
    for (const r of requeued.rows) console.log(`[sweeper] requeued stuck job ${r.id} (${r.name})`);
    for (const r of failed.rows) console.log(`[sweeper] failed poisoned job ${r.id} (${r.name})`);
  } catch (e: any) {
    console.warn(`[sweeper] pass failed (non-fatal): ${e.message}`);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot() {
  for (let attempt = 1; ; attempt++) {
    try {
      await initDb();
      app.listen(port, () => console.log(`GenShape3D API listening on http://localhost:${port}`));
      warmRembg();
      setInterval(sweepStuckJobs, SWEEP_INTERVAL_MS);
      sweepStuckJobs();
      return;
    } catch (err: any) {
      console.error(`Boot attempt ${attempt} failed: ${err.message} — retrying in 5s`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
boot();
