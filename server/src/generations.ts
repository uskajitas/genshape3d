// generations — the admin's view of how a subject was made, and the ways to make it again.
//
//   subject   one object: every job made from the same picture
//   run       one job of that subject: a builder, its references, and what followed
//   recipe    what a run does after its shape is built: repair, paint, publish
//
// A run is an ordinary job, so the workers know nothing of this. The recipe is carried
// out here, one step at a time, by looking at what each run still lacks.
import type { Express } from 'express';
import { dbQuery } from './db';
import { isAdmin } from './usersRepo';
import { publicR2Url } from './r2';
import { createJob, getJobById, repaintsOf, sealJob, sealSettings } from './jobsRepo';
import { createTextureJob } from './textureJobsRepo';
import { sealedResult } from './closeHoles';

const SOURCE = 'generations';        // runs made here stay out of every workspace
const NEWEST = 200;
const TICK_MS = 10_000;
const BUILDERS = ['trellis2', 'hunyuan3d', 'hunyuan3d-2-1', 'hi3dgen', 'partcrafter', 'triposr', 'sf3d', 'spar3d'];
const READS_VIEWS = 'hunyuan3d';     // the one builder that reads more than one picture
const VIEW = /(back|left|right)[^/]*\.png$/i;

export interface Recipe { repair?: boolean; paint?: 'builtin' | 'later' | 'none'; publish?: boolean; paintJob?: string; finished?: boolean; error?: string; }

const keyOf = (j: any): string =>
  j.subjectId || (j.name ? `${String(j.name).toLowerCase().replace(/[_\s]+/g, ' ').trim()}|${j.userEmail}` : j.id);

/** the file a finished job started as, whatever has been published over it since */
const rawOf = (j: any): string => j.rawResultUrl || j.resultUrl;
/** the repaired file; a job sealed before the column existed kept it as its result */
const fixedOf = (j: any): string =>
  j.sealedUrl || (j.sealReport?.at && j.rawResultUrl && j.resultUrl !== j.rawResultUrl ? j.resultUrl : '');

async function subjects() {
  const { rows } = await dbQuery(
    `SELECT * FROM genshape3d_jobs WHERE deleted = false AND "isBenchmark" = false AND status <> 'cancelled' AND model = ANY($1)
     ORDER BY "createdAt" DESC LIMIT ${NEWEST}`, [BUILDERS]);
  const repaints = await repaintsOf(rows.map((j) => j.id));
  const groups = new Map<string, any[]>();
  for (const j of rows) {
    const k = keyOf(j);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(j);
  }
  return [...groups.entries()].map(([id, jobs]) => {
    jobs.reverse();   // oldest first: the first run is the one the others are compared with
    const shown = jobs.find((j) => j.source !== SOURCE) || jobs[0];
    const paintedOf = (j: any) => repaints.find((t) => t.sourceJobId === j.id && t.status === 'done' && t.resultUrl);
    let published: { runId: string; version: string } | null = null;
    for (const j of jobs) {
      if (j.status !== 'done' || published) continue;
      const version = shown.resultUrl === fixedOf(j) ? 'fixed' : shown.resultUrl === rawOf(j) ? 'raw'
        : repaints.some((t) => t.sourceJobId === j.id && t.resultUrl === shown.resultUrl) ? 'painted' : '';
      if (version) published = { runId: j.id, version };
    }
    return {
      id, name: shown.name || 'Model', owner: shown.userEmail, picture: publicR2Url(shown.imageUrl), shownJobId: shown.id, published,
      runs: jobs.map((j) => {
        const views = ((j.auxImageUrls || []) as string[]).filter((u) => VIEW.test(u));
        const repaint = repaints.find((t) => t.sourceJobId === j.id);
        const painted = paintedOf(j);
        const done = j.status === 'done';
        return {
          id: j.id, model: j.model, status: j.status, progressPct: j.progressPct, errorMessage: j.errorMessage,
          createdAt: j.createdAt, startedAt: j.startedAt, completedAt: j.completedAt,
          machine: j.assignedWorkerId, gpuMemPeakMB: j.gpuMemPeakMB, paintBuiltIn: !!j.doTexture, recipe: j.recipe || {},
          references: [{ label: 'Front', file: publicR2Url(j.imageUrl) },
            ...views.map((u) => ({ label: VIEW.exec(u)![1].replace(/^./, (c) => c.toUpperCase()), file: publicR2Url(u.replace(/^https?:\/\/[^/]+\//, '').replace(/^genshape3d\//, '')) }))],
          rawFile: done ? publicR2Url(rawOf(j)) : '', fixedFile: done && fixedOf(j) ? publicR2Url(fixedOf(j)) : '',
          paintedFile: painted ? publicR2Url(painted.resultUrl) : '',
          repaint: repaint ? { status: repaint.status, progressPct: repaint.progressPct, errorMessage: repaint.errorMessage, machine: repaint.assignedWorkerId, startedAt: repaint.startedAt, completedAt: repaint.completedAt } : null,
          sealReport: j.sealReport || {},
        };
      }),
    };
  });
}

/** What people get for a subject becomes this file. The job's own files stay on record. */
async function publishTo(jobId: string, url: string): Promise<void> {
  await dbQuery(
    `UPDATE genshape3d_jobs SET
       "rawResultUrl" = CASE WHEN "rawResultUrl" = '' THEN "resultUrl" ELSE "rawResultUrl" END,
       "sealedUrl" = CASE WHEN "sealedUrl" = '' AND "rawResultUrl" <> '' AND "resultUrl" <> "rawResultUrl" AND "sealReport" ? 'at' THEN "resultUrl" ELSE "sealedUrl" END,
       "resultUrl" = $1, "updatedAt" = $2 WHERE id = $3`, [url, new Date().toISOString(), jobId]);
}

async function publish(runId: string, use: string): Promise<string | null> {
  const all = await subjects();
  const subject = all.find((s) => s.runs.some((r) => r.id === runId));
  const job: any = await getJobById(runId);
  if (!subject || !job) return 'no such run';
  const painted = (await repaintsOf([runId])).find((t) => t.status === 'done' && t.resultUrl);
  const url = ({ raw: rawOf(job), fixed: fixedOf(job), painted: painted?.resultUrl } as Record<string, string | undefined>)[use];
  if (!url) return 'that version does not exist yet';
  await publishTo(subject.shownJobId, url);
  return null;
}

const saveRecipe = (id: string, recipe: Recipe) =>
  dbQuery(`UPDATE genshape3d_jobs SET recipe = $1::jsonb WHERE id = $2`, [JSON.stringify(recipe), id]);

/** One look at every run with steps still to do; each call takes a run one step further. */
async function carryOut(): Promise<void> {
  const { rows } = await dbQuery(
    `SELECT * FROM genshape3d_jobs WHERE status = 'done' AND deleted = false AND recipe <> '{}'::jsonb
       AND COALESCE(recipe->>'finished', '') = '' ORDER BY "updatedAt" ASC LIMIT 20`);
  for (const job of rows) {
    const recipe: Recipe = job.recipe;
    try {
      if (recipe.repair && !job.rawResultUrl) {
        const { url, report } = await sealedResult(job.resultUrl, (await sealSettings()).maxRim);
        await sealJob(job.id, url, job.resultUrl, report);
        continue;
      }
      if (recipe.paint === 'later') {
        const repaints = await repaintsOf([job.id]);
        const mine = repaints.find((t) => t.id === recipe.paintJob);
        if (!recipe.paintJob) {
          const made = await createTextureJob({
            userEmail: job.userEmail, sourceJobId: job.id, sourceModelUrl: recipe.repair ? fixedOf(job) || job.resultUrl : rawOf(job),
            prompt: job.prompt || '', materialPreset: 'Auto', referenceImageKey: '', textureRes: '2K',
            variants: 1, seed: 0, strength: 65, keepShape: true, sourceImageUrl: job.imageUrl,
          });
          await saveRecipe(job.id, { ...recipe, paintJob: made.id });
          continue;
        }
        if (!mine || mine.status === 'failed') { await saveRecipe(job.id, { ...recipe, finished: true, error: mine?.errorMessage || 'the paint was lost' }); continue; }
        if (mine.status !== 'done') continue;
      }
      if (recipe.publish) {
        const problem = await publish(job.id, recipe.paint === 'later' ? 'painted' : recipe.repair ? 'fixed' : 'raw');
        if (problem) { await saveRecipe(job.id, { ...recipe, finished: true, error: problem }); continue; }
      }
      await saveRecipe(job.id, { ...recipe, finished: true });
    } catch (e: any) {
      console.warn('[generations]', job.id, e?.message || e);
    }
  }
}

export function startRecipes(): void {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await carryOut(); } catch (e: any) { console.warn('[generations] sweep', e?.message || e); } finally { busy = false; }
  }, TICK_MS);
}

export function mountGenerationsApi(app: Express): void {
  const admin = async (email: unknown) => isAdmin(String(email || ''));

  app.get('/api/generations', async (req, res) => {
    if (!(await admin(req.query.email))) return res.status(403).json({ error: 'Forbidden' });
    try { res.json({ settings: await sealSettings(), subjects: await subjects() }); } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // { email, fromRunId, runs: [{ model, references, paint, repair, publish }] }
  app.post('/api/generations/runs', async (req, res) => {
    const email = String(req.body?.email || '');
    if (!(await admin(email))) return res.status(403).json({ error: 'Forbidden' });
    try {
      const from: any = await getJobById(String(req.body?.fromRunId || ''));
      if (!from) return res.status(404).json({ error: 'no such run' });
      const wanted: any[] = Array.isArray(req.body?.runs) ? req.body.runs : [];
      if (!wanted.length || wanted.length > 8) return res.status(400).json({ error: 'runs: 1 to 8' });
      for (const w of wanted) {
        if (!BUILDERS.includes(w.model)) return res.status(400).json({ error: `unknown builder: ${w.model}` });
        // the 3090 draws back and left itself, so today it is one picture or three
        if (w.references !== 1 && w.references !== 3) return res.status(400).json({ error: 'references: 1 or 3' });
        if (w.references > 1 && w.model !== READS_VIEWS) return res.status(400).json({ error: `${w.model} reads one picture` });
      }
      const made: string[] = [];
      for (const w of wanted) {
        const paint: Recipe['paint'] = ['builtin', 'later', 'none'].includes(w.paint) ? w.paint : 'builtin';
        const job = await createJob({
          userEmail: email, imageUrl: from.imageUrl, name: from.name, prompt: from.prompt, style: 'Realistic',
          polygonBudget: 'Medium (50k-200k)', textureRes: '1K', exportFormat: 'GLB', detailLevel: 'Standard',
          doTexture: w.model === 'trellis2' || paint === 'builtin', autoRefine: false,
          octreeResolution: 384, targetFaceCount: 100000, inferenceSteps: 15, guidanceScale: 6, numChunks: 0, seed: 0,
          model: w.model, preferredWorkerId: 'win-3090',
          // Its worker adds views of its own to an upright subject unless some are given.
          // A picture under another name is given and then not read: one reference.
          useMultiView: w.references === 3,
          auxImageUrls: w.model === READS_VIEWS && w.references === 1 ? [from.imageUrl] : [],
        });
        const recipe: Recipe = { repair: w.repair !== false, paint, publish: w.publish === true };
        await dbQuery(`UPDATE genshape3d_jobs SET "subjectId" = $1, recipe = $2::jsonb, source = $3 WHERE id = $4`,
          [keyOf(from), JSON.stringify(recipe), SOURCE, job.id]);
        made.push(job.id);
      }
      res.json({ runs: made });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // The steps still to do on a finished run: { email, runId, repair, paint, publish }
  app.post('/api/generations/continue', async (req, res) => {
    if (!(await admin(req.body?.email))) return res.status(403).json({ error: 'Forbidden' });
    const job: any = await getJobById(String(req.body?.runId || ''));
    if (!job || job.status !== 'done') return res.status(404).json({ error: 'no finished run' });
    await saveRecipe(job.id, { repair: req.body.repair === true, paint: req.body.paint === 'later' ? 'later' : 'none', publish: req.body.publish === true });
    res.json({ ok: true });
  });

  // Which run, and which version of it, people get: { email, runId, use }
  app.post('/api/generations/publish', async (req, res) => {
    if (!(await admin(req.body?.email))) return res.status(403).json({ error: 'Forbidden' });
    try {
      const problem = await publish(String(req.body?.runId || ''), String(req.body?.use || ''));
      if (problem) return res.status(404).json({ error: problem });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
}
