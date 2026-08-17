// ─────────────────────────────────────────────────────────────────────────────
// Scenes API client — thin wrapper over /api/scenes.
// ─────────────────────────────────────────────────────────────────────────────

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

export interface Scene {
  id: string;
  userEmail: string;
  name: string;
  sceneData: SceneData;
  thumbnailUrl: string;
  createdAt: string;
  updatedAt: string;
}

async function toJson(r: Response) {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${r.status}`);
  }
  return r.json();
}

export const scenesApi = {
  list: (email: string): Promise<{ scenes: Scene[] }> =>
    fetch(`/api/scenes?email=${encodeURIComponent(email)}`).then(toJson),

  create: (email: string, name: string): Promise<{ scene: Scene }> =>
    fetch('/api/scenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    }).then(toJson),

  get: (id: string, email: string): Promise<{ scene: Scene }> =>
    fetch(`/api/scenes/${id}?email=${encodeURIComponent(email)}`).then(toJson),

  update: (
    id: string,
    email: string,
    data: { name?: string; sceneData?: SceneData; thumbnailUrl?: string },
  ): Promise<{ ok: true }> =>
    fetch(`/api/scenes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, ...data }),
    }).then(toJson),

  remove: (id: string, email: string): Promise<{ ok: true }> =>
    fetch(`/api/scenes/${id}?email=${encodeURIComponent(email)}`, { method: 'DELETE' }).then(toJson),
};
