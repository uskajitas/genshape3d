import { getDb, dbQuery } from './db';
import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RatingDimension {
  id: string;
  key: string;
  label: string;
  description: string;
  sort_order: number;
  active: boolean;
}

export interface BenchmarkCategory {
  id: string;
  name: string;
  parentId: string | null;
  sort_order: number;
  children?: BenchmarkCategory[];
}

export interface BenchmarkSubject {
  id: string;
  categoryId: string;
  categoryName?: string;
  parentCategoryName?: string;
  name: string;
  generationPrompt: string;
  imageUrl: string;
  notes: string;
  createdAt: string;
  runCount?: number;
}

export interface BenchmarkRun {
  id: string;
  name: string;
  configSnapshot: Record<string, any>;
  createdAt: string;
  completedAt: string | null;
  totalItems?: number;
  doneItems?: number;
  ratedItems?: number;
}

export interface BenchmarkRunItem {
  id: string;
  runId: string;
  subjectId: string;
  jobId: string | null;
  model: string;
  preset: string;
  octree: number;
  steps: number;
  guidance: number;
  faces: number;
  chunks: number;
  seed: number;
  ratings: Record<string, number> | null;
  ratingNotes: string;
  ratedAt: string | null;
  createdAt: string;
  // joined fields
  subjectName?: string;
  subjectImageUrl?: string;
  subjectCategoryId?: string;
  jobStatus?: string;
  jobResultUrl?: string;
  jobStartedAt?: string | null;
  jobCompletedAt?: string | null;
}

export interface CreateRunItemInput {
  subjectId: string;
  jobId: string;
  model: string;
  preset: string;
  octree: number;
  steps: number;
  guidance: number;
  faces: number;
  chunks: number;
  seed: number;
  doTexture?: boolean;
}

// ─── Rating dimensions ────────────────────────────────────────────────────────

export async function listRatingDimensions(): Promise<RatingDimension[]> {
  const { rows } = await dbQuery<RatingDimension>(
    `SELECT * FROM benchmark_rating_dimensions WHERE active = true ORDER BY sort_order`,
  );
  return rows;
}

export async function addRatingDimension(data: {
  key: string; label: string; description?: string;
}): Promise<RatingDimension> {
  const { rows } = await dbQuery<RatingDimension>(
    `INSERT INTO benchmark_rating_dimensions (key, label, description, sort_order)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM benchmark_rating_dimensions))
     RETURNING *`,
    [data.key, data.label, data.description || ''],
  );
  return rows[0];
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(): Promise<BenchmarkCategory[]> {
  const { rows } = await dbQuery<BenchmarkCategory>(
    `SELECT id, name, "parentId", sort_order FROM benchmark_categories ORDER BY sort_order`,
  );
  return rows;
}

// Returns a nested tree: top-level categories with their children embedded.
export async function getCategoryTree(): Promise<BenchmarkCategory[]> {
  const flat = await listCategories();
  const map = new Map(flat.map(c => [c.id, { ...c, children: [] as BenchmarkCategory[] }]));
  const roots: BenchmarkCategory[] = [];
  for (const c of map.values()) {
    if (c.parentId) map.get(c.parentId)?.children?.push(c);
    else roots.push(c);
  }
  return roots;
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

export async function listSubjects(): Promise<BenchmarkSubject[]> {
  const { rows } = await dbQuery<BenchmarkSubject>(
    `SELECT
       s.*,
       c.name AS "categoryName",
       p.name AS "parentCategoryName",
       (SELECT COUNT(*)::int FROM benchmark_run_items WHERE "subjectId" = s.id) AS "runCount"
     FROM benchmark_subjects s
     JOIN benchmark_categories c ON c.id = s."categoryId"
     LEFT JOIN benchmark_categories p ON p.id = c."parentId"
     WHERE s.deleted = false
     ORDER BY p.sort_order NULLS LAST, c.sort_order, s."createdAt"`,
  );
  return rows;
}

export async function getSubject(id: string): Promise<BenchmarkSubject | null> {
  const { rows } = await dbQuery<BenchmarkSubject>(
    `SELECT s.*, c.name AS "categoryName", p.name AS "parentCategoryName"
     FROM benchmark_subjects s
     JOIN benchmark_categories c ON c.id = s."categoryId"
     LEFT JOIN benchmark_categories p ON p.id = c."parentId"
     WHERE s.id = $1 AND s.deleted = false`,
    [id],
  );
  return rows[0] || null;
}

export async function createSubject(data: {
  categoryId: string;
  name: string;
  generationPrompt?: string;
  imageUrl?: string;
  notes?: string;
}): Promise<BenchmarkSubject> {
  const { rows } = await dbQuery<BenchmarkSubject>(
    `INSERT INTO benchmark_subjects ("categoryId", name, "generationPrompt", "imageUrl", notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.categoryId, data.name, data.generationPrompt || '', data.imageUrl || '', data.notes || ''],
  );
  return rows[0];
}

export async function updateSubject(id: string, data: {
  name?: string;
  categoryId?: string;
  generationPrompt?: string;
  imageUrl?: string;
  notes?: string;
}): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (data.name !== undefined)               { sets.push(`name = $${i++}`);                vals.push(data.name); }
  if (data.categoryId !== undefined)         { sets.push(`"categoryId" = $${i++}`);        vals.push(data.categoryId); }
  if (data.generationPrompt !== undefined)   { sets.push(`"generationPrompt" = $${i++}`);  vals.push(data.generationPrompt); }
  if (data.imageUrl !== undefined)           { sets.push(`"imageUrl" = $${i++}`);          vals.push(data.imageUrl); }
  if (data.notes !== undefined)              { sets.push(`notes = $${i++}`);               vals.push(data.notes); }
  if (sets.length === 0) return;
  vals.push(id);
  await dbQuery(`UPDATE benchmark_subjects SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

export async function deleteSubject(id: string): Promise<void> {
  await dbQuery(`UPDATE benchmark_subjects SET deleted = true WHERE id = $1`, [id]);
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export async function listRuns(): Promise<BenchmarkRun[]> {
  const { rows } = await dbQuery<BenchmarkRun>(
    `SELECT
       r.*,
       COUNT(i.id)::int                                              AS "totalItems",
       COUNT(i.id) FILTER (WHERE j.status = 'done')::int            AS "doneItems",
       COUNT(i.id) FILTER (WHERE i.ratings IS NOT NULL)::int        AS "ratedItems"
     FROM benchmark_runs r
     LEFT JOIN benchmark_run_items i ON i."runId" = r.id
     LEFT JOIN genshape3d_jobs j ON j.id = i."jobId"
     GROUP BY r.id
     ORDER BY r."createdAt" DESC`,
  );
  return rows;
}

export async function getRun(id: string): Promise<BenchmarkRun | null> {
  const { rows } = await dbQuery<BenchmarkRun>(
    `SELECT
       r.*,
       COUNT(i.id)::int                                              AS "totalItems",
       COUNT(i.id) FILTER (WHERE j.status = 'done')::int            AS "doneItems",
       COUNT(i.id) FILTER (WHERE i.ratings IS NOT NULL)::int        AS "ratedItems"
     FROM benchmark_runs r
     LEFT JOIN benchmark_run_items i ON i."runId" = r.id
     LEFT JOIN genshape3d_jobs j ON j.id = i."jobId"
     WHERE r.id = $1
     GROUP BY r.id`,
    [id],
  );
  return rows[0] || null;
}

export async function createRun(data: {
  name: string;
  configSnapshot: Record<string, any>;
}): Promise<BenchmarkRun> {
  const id = randomUUID();
  const { rows } = await dbQuery<BenchmarkRun>(
    `INSERT INTO benchmark_runs (id, name, "configSnapshot") VALUES ($1, $2, $3) RETURNING *`,
    [id, data.name, JSON.stringify(data.configSnapshot)],
  );
  return rows[0];
}

export async function markRunComplete(id: string): Promise<void> {
  await dbQuery(
    `UPDATE benchmark_runs SET "completedAt" = NOW() WHERE id = $1 AND "completedAt" IS NULL`,
    [id],
  );
}

// ─── Run items ────────────────────────────────────────────────────────────────

export async function getRunItems(runId: string): Promise<BenchmarkRunItem[]> {
  const { rows } = await dbQuery<BenchmarkRunItem>(
    `SELECT
       i.*,
       s.name           AS "subjectName",
       s."imageUrl"     AS "subjectImageUrl",
       s."categoryId"   AS "subjectCategoryId",
       j.status         AS "jobStatus",
       j."resultUrl"    AS "jobResultUrl",
       j."startedAt"    AS "jobStartedAt",
       j."completedAt"  AS "jobCompletedAt",
       j."auxImageUrls" AS "jobAuxImageUrls"
     FROM benchmark_run_items i
     JOIN benchmark_subjects s ON s.id = i."subjectId"
     LEFT JOIN genshape3d_jobs j ON j.id = i."jobId"
     WHERE i."runId" = $1
     ORDER BY s."categoryId", i."createdAt"`,
    [runId],
  );
  return rows;
}

export async function createRunItems(
  runId: string,
  items: CreateRunItemInput[],
): Promise<void> {
  if (items.length === 0) return;
  // Bulk insert
  const placeholders = items.map((_, i) => {
    const b = i * 10;
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`;
  }).join(',');
  const values = items.flatMap(it => [
    randomUUID(), runId, it.subjectId, it.jobId,
    it.model, it.preset, it.octree, it.steps, it.guidance, it.faces,
  ]);
  // chunks + seed need separate handling due to count — do individual inserts instead
  for (const it of items) {
    await dbQuery(
      `INSERT INTO benchmark_run_items
         (id, "runId", "subjectId", "jobId", model, preset, octree, steps, guidance, faces, chunks, seed, "doTexture")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [randomUUID(), runId, it.subjectId, it.jobId, it.model, it.preset,
       it.octree, it.steps, it.guidance, it.faces, it.chunks, it.seed, it.doTexture === true],
    );
  }
}

export async function rateRunItem(
  id: string,
  ratings: Record<string, number>,
  notes: string,
): Promise<void> {
  await dbQuery(
    `UPDATE benchmark_run_items
     SET ratings = $1::jsonb, "ratingNotes" = $2, "ratedAt" = NOW()
     WHERE id = $3`,
    [JSON.stringify(ratings), notes, id],
  );
}

export async function exportRun(runId: string): Promise<any[]> {
  const items = await getRunItems(runId);
  const run = await getRun(runId);
  return items.map(it => ({
    runId,
    runName: run?.name,
    subject: it.subjectName,
    subjectImageUrl: it.subjectImageUrl,
    model: it.model,
    preset: it.preset,
    params: { octree: it.octree, steps: it.steps, guidance: it.guidance, faces: it.faces, chunks: it.chunks, seed: it.seed },
    status: it.jobStatus,
    startedAt: it.jobStartedAt,
    completedAt: it.jobCompletedAt,
    durationSeconds: (it.jobStartedAt && it.jobCompletedAt)
      ? Math.round((new Date(it.jobCompletedAt).getTime() - new Date(it.jobStartedAt).getTime()) / 1000)
      : null,
    resultUrl: it.jobResultUrl,
    ratings: it.ratings,
    ratingNotes: it.ratingNotes,
    ratedAt: it.ratedAt,
  }));
}
