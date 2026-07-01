import { getDb, dbQuery } from './db';
import { randomUUID } from 'node:crypto';

export interface AssetGroup {
  id: string;
  userEmail: string;
  name: string;
  styleAnchorUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetGroupSummary extends AssetGroup {
  jobCount: number;
  doneCount: number;
  thumbUrl: string;  // first done job's resultUrl, or first job's imageUrl, or styleAnchorUrl
}

export async function createGroup(data: {
  userEmail: string;
  name: string;
  styleAnchorUrl?: string;
  notes?: string;
}): Promise<AssetGroup> {
  const { rows } = await dbQuery<AssetGroup>(
    `INSERT INTO genshape3d_asset_groups
       (id, "userEmail", name, "styleAnchorUrl", notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [randomUUID(), data.userEmail, data.name, data.styleAnchorUrl || '', data.notes || ''],
  );
  return rows[0];
}

export async function getGroup(id: string): Promise<AssetGroup | null> {
  const { rows } = await dbQuery<AssetGroup>(
    `SELECT * FROM genshape3d_asset_groups WHERE id = $1 AND deleted = false`,
    [id],
  );
  return rows[0] || null;
}

export async function listGroupsByUser(userEmail: string): Promise<AssetGroupSummary[]> {
  // For each group: count jobs, count done jobs, pick a thumbnail.
  // Thumbnail preference: first done resultUrl > first imageUrl > styleAnchorUrl.
  const { rows } = await dbQuery<AssetGroupSummary>(
    `SELECT
       g.*,
       COALESCE(j.cnt,        0)::int AS "jobCount",
       COALESCE(j.done_cnt,   0)::int AS "doneCount",
       COALESCE(
         j.first_done_url,
         j.first_image_url,
         g."styleAnchorUrl"
       ) AS "thumbUrl"
     FROM genshape3d_asset_groups g
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) AS cnt,
         COUNT(*) FILTER (WHERE status = 'done') AS done_cnt,
         (SELECT "resultUrl" FROM genshape3d_jobs
            WHERE "groupId" = g.id AND status = 'done' AND deleted = false
            ORDER BY "completedAt" ASC NULLS LAST LIMIT 1) AS first_done_url,
         (SELECT "imageUrl" FROM genshape3d_jobs
            WHERE "groupId" = g.id AND deleted = false
            ORDER BY "createdAt" ASC LIMIT 1) AS first_image_url
       FROM genshape3d_jobs
       WHERE "groupId" = g.id AND deleted = false
     ) j ON true
     WHERE g."userEmail" = $1 AND g.deleted = false
     ORDER BY g."createdAt" DESC`,
    [userEmail],
  );
  return rows;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  await dbQuery(
    `UPDATE genshape3d_asset_groups SET name = $1, "updatedAt" = NOW() WHERE id = $2`,
    [name, id],
  );
}

export async function setGroupStyleAnchor(id: string, styleAnchorUrl: string): Promise<void> {
  await dbQuery(
    `UPDATE genshape3d_asset_groups SET "styleAnchorUrl" = $1, "updatedAt" = NOW() WHERE id = $2`,
    [styleAnchorUrl, id],
  );
}

export async function deleteGroup(id: string): Promise<void> {
  // Soft-delete the group; child jobs keep their groupId but the group
  // disappears from the sidebar. We do NOT touch the jobs themselves.
  await dbQuery(
    `UPDATE genshape3d_asset_groups SET deleted = true, "updatedAt" = NOW() WHERE id = $1`,
    [id],
  );
}
