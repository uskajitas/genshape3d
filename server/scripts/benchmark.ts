// ─────────────────────────────────────────────────────────────────────────────
// benchmark.ts — real end-to-end timing harness for the GenShape3D pipeline.
//
// What it does
//   1. Ensures 8 reference test images exist in ./bench-images (downloads from
//      Wikimedia Commons on first run; safe to re-run, idempotent).
//   2. For each (image × quality preset) it:
//        a) POSTs the image to https://api.genshape3d.com/api/upload (real
//           production tunnel — the same path users will hit).
//        b) Polls GET /api/jobs every 5 s and watches the job through the
//           DB-recorded phases (createdAt → startedAt → progressPct → done).
//        c) Downloads the resulting GLB and saves it under ./bench-output/.
//        d) Writes one row to bench-results.csv with full timing breakdown.
//   3. Runs strictly sequentially because the worker is MAX_CONCURRENT=1.
//      To exercise the real queue dynamics use --concurrent N (the script then
//      submits N jobs back-to-back without waiting and measures how queue
//      time grows for later jobs).
//   4. Saves a JSON summary at the end (success rate, p50/p95 wall time,
//      queue-time distribution, per-phase averages).
//
// Usage (from /server)
//   npx ts-node scripts/benchmark.ts              # one-shot, sequential, defaults
//   npx ts-node scripts/benchmark.ts --quality standard
//   npx ts-node scripts/benchmark.ts --concurrent 4
//   npx ts-node scripts/benchmark.ts --base http://192.168.20.8:8110
//   npx ts-node scripts/benchmark.ts --email bench@example.com
//   npx ts-node scripts/benchmark.ts --images vase,chair --quality both
//
// Cleanup
//   The script deletes the test jobs it created from the DB at the end (via
//   DELETE /api/jobs/:id) so they don't pollute your real history. Pass
//   --keep to skip cleanup if you want to inspect them in the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Config + CLI
// ─────────────────────────────────────────────────────────────────────────────

const ARGS = (() => {
  const out: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
})();

const BASE_URL    = (ARGS.base as string)    || 'https://api.genshape3d.com';
const EMAIL       = (ARGS.email as string)   || 'usquiano@gmail.com';
const QUALITY     = (ARGS.quality as string) || 'both'; // standard | high | both
const CONCURRENT  = parseInt((ARGS.concurrent as string) || '1', 10);
const POLL_MS     = parseInt((ARGS.poll as string) || '5000', 10);
const TIMEOUT_MIN = parseInt((ARGS.timeout as string) || '40', 10);
const KEEP_JOBS   = Boolean(ARGS.keep);
const ONLY_IMAGES = (ARGS.images as string)?.split(',').map(s => s.trim()).filter(Boolean);

const SCRIPT_DIR  = __dirname;
const IMG_DIR     = path.join(SCRIPT_DIR, 'bench-images');
const OUT_DIR     = path.join(SCRIPT_DIR, 'bench-output');
const CSV_PATH    = path.join(SCRIPT_DIR, 'bench-results.csv');
const JSON_PATH   = path.join(SCRIPT_DIR, 'bench-summary.json');

// ─────────────────────────────────────────────────────────────────────────────
// Test image manifest — uses whatever PNG / JPG / JPEG files are present in
// ./bench-images. The script does NOT download anything; you (or the user)
// drop the images in beforehand. Works with the official Hunyuan3D-2 example
// images at https://github.com/Tencent-Hunyuan/Hunyuan3D-2/tree/main/assets/example_images
// ─────────────────────────────────────────────────────────────────────────────

interface BenchImage {
  name: string;     // filename stem (used in CSV + output filenames)
  path: string;     // absolute path on disk
  category: string; // human label — defaults to filename stem
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality presets — match the worker's build_params() label maps in
// genshape-worker/worker.py so we exercise the same code paths real users do.
// ─────────────────────────────────────────────────────────────────────────────

interface QualityPreset {
  id: 'standard' | 'standard-tex' | 'high' | 'high-tex';
  label: string;
  inferenceSteps: number;
  octreeResolution: number;
  targetFaceCount: number;
  guidanceScale: number;
  doTexture: boolean;
}

const PRESETS: QualityPreset[] = [
  {
    id: 'standard',
    label: 'Standard (turbo / 5 steps / 256³ / 30k faces)',
    inferenceSteps: 5, octreeResolution: 256, targetFaceCount: 30000,
    guidanceScale: 5.0, doTexture: false,
  },
  {
    id: 'standard-tex',
    label: 'Standard + texture',
    inferenceSteps: 5, octreeResolution: 256, targetFaceCount: 30000,
    guidanceScale: 5.0, doTexture: true,
  },
  {
    id: 'high',
    label: 'High (full / 15 steps / 384³ / 100k faces)',
    inferenceSteps: 15, octreeResolution: 384, targetFaceCount: 100000,
    guidanceScale: 6.0, doTexture: false,
  },
  {
    id: 'high-tex',
    label: 'High + texture',
    inferenceSteps: 15, octreeResolution: 384, targetFaceCount: 100000,
    guidanceScale: 6.0, doTexture: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Result row + metric helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ResultRow {
  image: string;
  category: string;
  preset: string;
  inferenceSteps: number;
  octreeResolution: number;
  targetFaceCount: number;
  jobId: string;
  submittedAt: string;
  startedAt: string;
  completedAt: string;
  queueSeconds: number;     // startedAt - submittedAt
  runSeconds: number;       // completedAt - startedAt
  wallSeconds: number;      // completedAt - submittedAt
  status: string;
  glbBytes: number;
  glbPath: string;
  error: string;
}

const csvHeader = [
  'image','category','preset','inferenceSteps','octreeResolution','targetFaceCount',
  'jobId','submittedAt','startedAt','completedAt',
  'queueSeconds','runSeconds','wallSeconds',
  'status','glbBytes','glbPath','error',
].join(',');

const csvRow = (r: ResultRow) =>
  [r.image, r.category, r.preset, r.inferenceSteps, r.octreeResolution, r.targetFaceCount,
   r.jobId, r.submittedAt, r.startedAt, r.completedAt,
   r.queueSeconds, r.runSeconds, r.wallSeconds,
   r.status, r.glbBytes, r.glbPath, JSON.stringify(r.error || '')]
  .join(',');

const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
};

// ─────────────────────────────────────────────────────────────────────────────
// IO helpers
// ─────────────────────────────────────────────────────────────────────────────

const ensureDir = (dir: string) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

const discoverImages = (): BenchImage[] => {
  if (!fs.existsSync(IMG_DIR)) {
    console.error(`bench-images folder missing: ${IMG_DIR}`);
    console.error('drop your test images there first.');
    process.exit(1);
  }
  const files = fs.readdirSync(IMG_DIR)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();
  if (!files.length) {
    console.error(`no images found in ${IMG_DIR}`);
    process.exit(1);
  }
  let out: BenchImage[] = files.map(f => ({
    name: path.parse(f).name,
    path: path.join(IMG_DIR, f),
    category: path.parse(f).name,
  }));
  if (ONLY_IMAGES?.length) {
    out = out.filter(i => ONLY_IMAGES.includes(i.name));
    if (!out.length) {
      console.error(`no images matched --images ${ONLY_IMAGES.join(',')}`);
      process.exit(1);
    }
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
// API client
// ─────────────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled' | 'error' | 'running';
  imageUrl?: string;
  resultUrl?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  progressPct?: number;
  progressPhase?: string;
}

const submitJob = async (
  imagePath: string,
  preset: QualityPreset,
): Promise<Job> => {
  const blob = new Blob([fs.readFileSync(imagePath)]);
  const fd = new FormData();
  fd.append('image', blob, path.basename(imagePath));
  fd.append('email', EMAIL);
  fd.append('exportFormat', 'GLB');
  fd.append('inferenceSteps',   String(preset.inferenceSteps));
  fd.append('octreeResolution', String(preset.octreeResolution));
  fd.append('targetFaceCount',  String(preset.targetFaceCount));
  fd.append('guidanceScale',    String(preset.guidanceScale));
  fd.append('doTexture',        String(preset.doTexture));

  const r = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: fd as any });
  if (!r.ok) throw new Error(`submit: HTTP ${r.status} ${await r.text()}`);
  const data: any = await r.json();
  return data.job ?? data;
};

const fetchJobs = async (): Promise<Job[]> => {
  const r = await fetch(`${BASE_URL}/api/jobs?email=${encodeURIComponent(EMAIL)}`);
  if (!r.ok) return [];
  const data: any = await r.json();
  return Array.isArray(data) ? data : (data.jobs || []);
};

const fetchJobById = async (id: string): Promise<Job | null> => {
  const list = await fetchJobs();
  return list.find(j => j.id === id) ?? null;
};

const downloadGlb = async (resultUrl: string, dest: string): Promise<number> => {
  const key = resultUrl.startsWith('http') ? resultUrl : '';
  const url = `${BASE_URL}/api/mesh?key=${encodeURIComponent(key || resultUrl)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download glb: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
};

const deleteJob = async (id: string) => {
  try { await fetch(`${BASE_URL}/api/jobs/${id}`, { method: 'DELETE' }); }
  catch { /* best effort */ }
};

// ─────────────────────────────────────────────────────────────────────────────
// Single-job tracker
// ─────────────────────────────────────────────────────────────────────────────

const isTerminal = (s: string) => ['done', 'failed', 'cancelled', 'error'].includes(s);

const waitForTerminal = async (
  jobId: string,
  timeoutMs: number,
  onPhase: (j: Job) => void,
): Promise<Job> => {
  const deadline = Date.now() + timeoutMs;
  let lastPhase = '';
  while (Date.now() < deadline) {
    const job = await fetchJobById(jobId);
    if (job) {
      const phase = `${job.status}/${job.progressPct ?? 0}%/${job.progressPhase ?? ''}`;
      if (phase !== lastPhase) {
        onPhase(job);
        lastPhase = phase;
      }
      if (isTerminal(job.status)) return job;
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  throw new Error(`timed out after ${timeoutMs / 1000}s`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Run a single image × preset combo
// ─────────────────────────────────────────────────────────────────────────────

const runOne = async (img: BenchImage, preset: QualityPreset): Promise<ResultRow> => {
  const tag = `${img.name}/${preset.id}`;
  console.log(`\n▶ ${tag}  (${preset.label})`);

  const submittedAt = new Date();
  let job: Job;
  try {
    job = await submitJob(img.path, preset);
  } catch (e: any) {
    return {
      image: img.name, category: img.category, preset: preset.id,
      inferenceSteps: preset.inferenceSteps, octreeResolution: preset.octreeResolution,
      targetFaceCount: preset.targetFaceCount,
      jobId: '', submittedAt: submittedAt.toISOString(),
      startedAt: '', completedAt: '',
      queueSeconds: 0, runSeconds: 0, wallSeconds: 0,
      status: 'submit-failed', glbBytes: 0, glbPath: '',
      error: e.message,
    };
  }

  console.log(`  ✓ submitted: ${job.id}`);

  let final: Job;
  try {
    final = await waitForTerminal(job.id, TIMEOUT_MIN * 60_000, j => {
      const pct = j.progressPct ?? 0;
      console.log(`  · ${j.status}  ${pct}%  ${j.progressPhase ?? ''}`);
    });
  } catch (e: any) {
    return {
      image: img.name, category: img.category, preset: preset.id,
      inferenceSteps: preset.inferenceSteps, octreeResolution: preset.octreeResolution,
      targetFaceCount: preset.targetFaceCount,
      jobId: job.id, submittedAt: submittedAt.toISOString(),
      startedAt: '', completedAt: '',
      queueSeconds: 0, runSeconds: 0, wallSeconds: 0,
      status: 'timeout', glbBytes: 0, glbPath: '',
      error: e.message,
    };
  }

  // Timing
  const t0 = new Date(final.createdAt   || submittedAt).getTime();
  const t1 = new Date(final.startedAt   || final.createdAt   || submittedAt).getTime();
  const t2 = new Date(final.completedAt || final.startedAt || submittedAt).getTime();

  // Download GLB (if successful)
  let glbBytes = 0;
  let glbPath  = '';
  if (final.status === 'done' && final.resultUrl) {
    ensureDir(OUT_DIR);
    const stem = `${img.name}-${preset.id}-${final.id.slice(0, 8)}.glb`;
    const dest = path.join(OUT_DIR, stem);
    try {
      glbBytes = await downloadGlb(final.resultUrl, dest);
      glbPath  = dest;
      console.log(`  ✓ done  ${(glbBytes / 1024).toFixed(0)} KB → ${stem}`);
    } catch (e: any) {
      console.log(`  ! glb download failed: ${e.message}`);
    }
  } else {
    console.log(`  ! ended in status=${final.status}`);
  }

  return {
    image: img.name, category: img.category, preset: preset.id,
    inferenceSteps: preset.inferenceSteps, octreeResolution: preset.octreeResolution,
    targetFaceCount: preset.targetFaceCount,
    jobId: final.id,
    submittedAt: submittedAt.toISOString(),
    startedAt:  final.startedAt   || '',
    completedAt: final.completedAt || '',
    queueSeconds: Math.round((t1 - t0) / 1000),
    runSeconds:   Math.round((t2 - t1) / 1000),
    wallSeconds:  Math.round((t2 - t0) / 1000),
    status: final.status,
    glbBytes, glbPath,
    error: '',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Concurrent submission run (queue dynamics)
// ─────────────────────────────────────────────────────────────────────────────

const runConcurrent = async (
  pairs: { img: BenchImage; preset: QualityPreset }[],
): Promise<ResultRow[]> => {
  console.log(`\n▶▶ submitting ${pairs.length} jobs in parallel (concurrency test)\n`);
  // Submit all simultaneously to put real load on the queue
  const submissions = await Promise.all(pairs.map(async (p) => {
    const submittedAt = new Date();
    try {
      const job = await submitJob(p.img.path, p.preset);
      // (p.img.path is the absolute file path; submitJob reads it as a Blob)
      console.log(`  ✓ submitted ${p.img.name}/${p.preset.id}: ${job.id}`);
      return { ...p, submittedAt, job, error: '' as string };
    } catch (e: any) {
      return { ...p, submittedAt, job: null as Job | null, error: e.message };
    }
  }));

  // Wait for each in parallel, but each tracks its own timing
  const rows = await Promise.all(submissions.map(async (s): Promise<ResultRow> => {
    const base = {
      image: s.img.name, category: s.img.category, preset: s.preset.id,
      inferenceSteps: s.preset.inferenceSteps, octreeResolution: s.preset.octreeResolution,
      targetFaceCount: s.preset.targetFaceCount,
      submittedAt: s.submittedAt.toISOString(),
    };
    if (!s.job) {
      return { ...base, jobId: '', startedAt: '', completedAt: '',
        queueSeconds: 0, runSeconds: 0, wallSeconds: 0,
        status: 'submit-failed', glbBytes: 0, glbPath: '', error: s.error };
    }
    try {
      const final = await waitForTerminal(s.job.id, TIMEOUT_MIN * 60_000 * pairs.length, () => {});
      const t0 = new Date(final.createdAt   || s.submittedAt).getTime();
      const t1 = new Date(final.startedAt   || final.createdAt   || s.submittedAt).getTime();
      const t2 = new Date(final.completedAt || final.startedAt || s.submittedAt).getTime();
      let glbBytes = 0, glbPath = '';
      if (final.status === 'done' && final.resultUrl) {
        ensureDir(OUT_DIR);
        const stem = `${s.img.name}-${s.preset.id}-${final.id.slice(0, 8)}.glb`;
        const dest = path.join(OUT_DIR, stem);
        try { glbBytes = await downloadGlb(final.resultUrl, dest); glbPath = dest; } catch {}
      }
      return { ...base, jobId: final.id,
        startedAt:  final.startedAt   || '',
        completedAt: final.completedAt || '',
        queueSeconds: Math.round((t1 - t0) / 1000),
        runSeconds:   Math.round((t2 - t1) / 1000),
        wallSeconds:  Math.round((t2 - t0) / 1000),
        status: final.status, glbBytes, glbPath, error: '' };
    } catch (e: any) {
      return { ...base, jobId: s.job.id, startedAt: '', completedAt: '',
        queueSeconds: 0, runSeconds: 0, wallSeconds: 0,
        status: 'timeout', glbBytes: 0, glbPath: '', error: e.message };
    }
  }));

  return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

const summarize = (rows: ResultRow[]) => {
  const ok = rows.filter(r => r.status === 'done');
  const wall = ok.map(r => r.wallSeconds).sort((a, b) => a - b);
  const run  = ok.map(r => r.runSeconds).sort((a, b) => a - b);
  const queue = ok.map(r => r.queueSeconds).sort((a, b) => a - b);

  const byPreset: Record<string, ResultRow[]> = {};
  for (const r of rows) (byPreset[r.preset] ||= []).push(r);

  return {
    total: rows.length,
    succeeded: ok.length,
    failed: rows.filter(r => r.status === 'failed' || r.status === 'error').length,
    timeout: rows.filter(r => r.status === 'timeout').length,
    submit_failed: rows.filter(r => r.status === 'submit-failed').length,
    successRate: rows.length ? ok.length / rows.length : 0,

    overall: {
      wall_p50_s: percentile(wall, 50),
      wall_p95_s: percentile(wall, 95),
      run_p50_s:  percentile(run,  50),
      run_p95_s:  percentile(run,  95),
      queue_p50_s: percentile(queue, 50),
      queue_p95_s: percentile(queue, 95),
    },

    perPreset: Object.fromEntries(Object.entries(byPreset).map(([k, list]) => {
      const okList = list.filter(r => r.status === 'done');
      const w = okList.map(r => r.wallSeconds).sort((a, b) => a - b);
      const r = okList.map(r => r.runSeconds).sort((a, b) => a - b);
      return [k, {
        total: list.length,
        succeeded: okList.length,
        wall_p50_s: percentile(w, 50),
        wall_p95_s: percentile(w, 95),
        run_p50_s:  percentile(r, 50),
        run_p95_s:  percentile(r, 95),
        avg_glb_kb: okList.length
          ? Math.round(okList.reduce((s, x) => s + x.glbBytes, 0) / okList.length / 1024)
          : 0,
      }];
    })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log('GenShape3D end-to-end benchmark');
  console.log('───────────────────────────────────────────');
  console.log(`base:        ${BASE_URL}`);
  console.log(`email:       ${EMAIL}`);
  console.log(`quality:     ${QUALITY}`);
  console.log(`concurrency: ${CONCURRENT}`);
  console.log(`poll:        ${POLL_MS} ms`);
  console.log(`timeout:     ${TIMEOUT_MIN} min/job`);
  console.log(`csv:         ${CSV_PATH}`);

  // 1. Resolve images
  const images = discoverImages();
  console.log(`\nimages ready: ${images.map(i => i.name).join(', ')}`);

  // 2. Resolve presets — supports 'both', a single id, or comma-separated ids.
  let presets: QualityPreset[];
  if (QUALITY === 'both') {
    presets = PRESETS;
  } else {
    const ids = QUALITY.split(',').map(s => s.trim()).filter(Boolean);
    presets = PRESETS.filter(p => ids.includes(p.id));
  }
  if (!presets.length) { console.error(`unknown --quality ${QUALITY}`); process.exit(1); }

  // 3. Build pairs
  let pairs = images.flatMap(img => presets.map(preset => ({ img, preset })));

  // 4. Init CSV (create + write header on first run; otherwise append)
  if (!fs.existsSync(CSV_PATH)) fs.writeFileSync(CSV_PATH, csvHeader + '\n');

  // 4a. Resume support — skip image/preset combos that already have a `done`
  // row in the CSV. Re-runs after a crash pick up where they left off.
  const existing = fs.readFileSync(CSV_PATH, 'utf8').split('\n').slice(1)
    .filter(Boolean).map(line => {
      const cols = line.split(',');
      return { image: cols[0], preset: cols[2], status: cols[13] };
    });
  // Skip any combo we've already attempted (done OR timeout OR submit-failed),
  // because timeouts here are usually the bench giving up waiting, but the job
  // typically completes on the worker afterwards. Re-submitting causes
  // duplicates that aren't worth the GPU time.
  const doneKeys = new Set(existing
    .filter(e => e.image && e.preset)
    .map(e => `${e.image}/${e.preset}`));
  const skipped = pairs.filter(p => doneKeys.has(`${p.img.name}/${p.preset.id}`));
  pairs = pairs.filter(p => !doneKeys.has(`${p.img.name}/${p.preset.id}`));
  if (skipped.length) {
    console.log(`\nresume: skipping ${skipped.length} already-done combos:`);
    for (const s of skipped) console.log(`  · ${s.img.name}/${s.preset.id}`);
  }
  if (!pairs.length) { console.log('\nnothing to do — all combos already done.'); process.exit(0); }
  console.log(`\n${pairs.length} jobs to run`);

  // 5. Run
  const t0 = performance.now();
  const rows: ResultRow[] = [];

  // Persist rows incrementally so a Ctrl-C doesn't lose data
  const persist = (r: ResultRow) => fs.appendFileSync(CSV_PATH, csvRow(r) + '\n');

  if (CONCURRENT > 1) {
    // Submit in batches of CONCURRENT
    for (let i = 0; i < pairs.length; i += CONCURRENT) {
      const batch = pairs.slice(i, i + CONCURRENT);
      const out = await runConcurrent(batch);
      for (const r of out) { rows.push(r); persist(r); }
    }
  } else {
    for (const p of pairs) {
      const r = await runOne(p.img, p.preset);
      rows.push(r); persist(r);
    }
  }

  // 6. Cleanup test jobs unless --keep
  if (!KEEP_JOBS) {
    console.log('\ncleaning up test jobs…');
    for (const r of rows) if (r.jobId) await deleteJob(r.jobId);
  }

  // 7. Summary
  const totalMin = ((performance.now() - t0) / 60000).toFixed(1);
  const summary = summarize(rows);
  fs.writeFileSync(JSON_PATH, JSON.stringify(summary, null, 2));

  console.log('\n═══════════════════ SUMMARY ═══════════════════');
  console.log(`total wall:  ${totalMin} min`);
  console.log(`success:     ${summary.succeeded}/${summary.total}  (${(summary.successRate * 100).toFixed(0)}%)`);
  console.log(`p50 wall:    ${(summary.overall.wall_p50_s / 60).toFixed(1)} min`);
  console.log(`p95 wall:    ${(summary.overall.wall_p95_s / 60).toFixed(1)} min`);
  console.log(`p50 queue:   ${(summary.overall.queue_p50_s).toFixed(0)} s`);
  console.log(`p95 queue:   ${(summary.overall.queue_p95_s).toFixed(0)} s`);
  for (const [name, s] of Object.entries(summary.perPreset)) {
    const ss: any = s;
    console.log(`  · ${name}: ${ss.succeeded}/${ss.total} ok, p50 run ${(ss.run_p50_s / 60).toFixed(1)} min, avg ${ss.avg_glb_kb} KB`);
  }
  console.log(`\ncsv:         ${CSV_PATH}`);
  console.log(`json:        ${JSON_PATH}`);
  console.log(`glbs:        ${OUT_DIR}`);
};

main().catch(e => { console.error(e); process.exit(1); });
