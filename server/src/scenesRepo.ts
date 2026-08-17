import { dbQuery } from './db';
import { randomUUID } from 'node:crypto';

export interface SceneNode {
  id: string;
  jobId: string;
  name: string;
  resultUrl: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SceneLighting {
  ambientIntensity: number;
  keyIntensity: number;
  keyAzimuth: number;
  keyElevation: number;
  background: string;
}

export interface SceneCamera {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface SceneData {
  nodes: SceneNode[];
  lighting: SceneLighting;
  camera: SceneCamera;
}

export const DEFAULT_SCENE_DATA: SceneData = {
  nodes: [],
  lighting: {
    ambientIntensity: 0.9,
    keyIntensity: 2.2,
    keyAzimuth: 45,
    keyElevation: 55,
    background: '#101013',
  },
  camera: {
    position: [0, 1.6, 4],
    target: [0, 0.5, 0],
    fov: 45,
  },
};

export interface Scene {
  id: string;
  userEmail: string;
  name: string;
  sceneData: SceneData;
  thumbnailUrl: string;
  createdAt: string;
  updatedAt: string;
}

const SELECT_COLS = `id, "userEmail", name, "sceneData", "thumbnailUrl", "createdAt", "updatedAt"`;

export async function listScenesByUser(userEmail: string): Promise<Scene[]> {
  const { rows } = await dbQuery<Scene>(
    `SELECT ${SELECT_COLS} FROM genshape3d_scenes
     WHERE "userEmail" = $1 AND deleted = false
     ORDER BY "updatedAt" DESC`,
    [userEmail],
  );
  return rows;
}

export async function getScene(id: string): Promise<Scene | null> {
  const { rows } = await dbQuery<Scene>(
    `SELECT ${SELECT_COLS} FROM genshape3d_scenes WHERE id = $1 AND deleted = false`,
    [id],
  );
  return rows[0] || null;
}

export async function createScene(userEmail: string, name: string): Promise<Scene> {
  const { rows } = await dbQuery<Scene>(
    `INSERT INTO genshape3d_scenes (id, "userEmail", name, "sceneData")
     VALUES ($1, $2, $3, $4)
     RETURNING ${SELECT_COLS}`,
    [randomUUID(), userEmail, name, JSON.stringify(DEFAULT_SCENE_DATA)],
  );
  return rows[0];
}

export async function updateScene(
  id: string,
  data: { name?: string; sceneData?: SceneData; thumbnailUrl?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (data.name !== undefined) { sets.push(`name = $${i++}`); params.push(data.name); }
  if (data.sceneData !== undefined) { sets.push(`"sceneData" = $${i++}`); params.push(JSON.stringify(data.sceneData)); }
  if (data.thumbnailUrl !== undefined) { sets.push(`"thumbnailUrl" = $${i++}`); params.push(data.thumbnailUrl); }
  if (!sets.length) return;
  sets.push(`"updatedAt" = NOW()`);
  params.push(id);
  await dbQuery(`UPDATE genshape3d_scenes SET ${sets.join(', ')} WHERE id = $${i}`, params);
}

// Soft-delete only — never destroys the scene's referenced GLBs (they live
// in genshape3d_jobs and are untouched by any scene operation).
export async function deleteScene(id: string): Promise<void> {
  await dbQuery(`UPDATE genshape3d_scenes SET deleted = true, "updatedAt" = NOW() WHERE id = $1`, [id]);
}
