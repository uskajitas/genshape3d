// ─────────────────────────────────────────────────────────────────────────────
// Scenes API client + scene document schema.
//
// Schema is versioned. v2 (current) supports an arbitrary light list,
// environment settings, and per-node visibility. v1 documents (single
// baked-in key light) are migrated on load — never rewritten on the server
// until the user saves.
// ─────────────────────────────────────────────────────────────────────────────

export type Vec3 = [number, number, number];

export interface SceneNode {
  id: string;
  jobId: string;
  name: string;
  resultUrl: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  visible?: boolean;
  /** True when position was saved with the pivot at the model's geometric
   *  center. Older documents used a bottom pivot; the editor lifts those by
   *  half the model height on load so they keep sitting on the floor. */
  pivotCenter?: boolean;
}

export type LightType = 'directional' | 'point' | 'spot';

export interface SceneLight {
  id: string;
  type: LightType;
  name: string;
  color: string;
  intensity: number;
  position: Vec3;
  /** Aim point for directional/spot lights. */
  target: Vec3;
  castShadow: boolean;
  /** Spot only: cone angle in degrees. */
  angle?: number;
  /** Spot only: 0..1 edge softness. */
  penumbra?: number;
}

export interface SceneEnvironment {
  background: string;
  ambientColor: string;
  ambientIntensity: number;
  showGrid: boolean;
  showGround: boolean;
}

export interface SceneCamera {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface SceneData {
  version: 2;
  nodes: SceneNode[];
  lights: SceneLight[];
  environment: SceneEnvironment;
  camera: SceneCamera;
}

export const DEFAULT_ENVIRONMENT: SceneEnvironment = {
  background: '#101013',
  ambientColor: '#ffffff',
  ambientIntensity: 0.7,
  showGrid: true,
  showGround: true,
};

export const DEFAULT_CAMERA: SceneCamera = {
  position: [3.2, 2.2, 3.2],
  target: [0, 0.5, 0],
  fov: 45,
};

export function makeLight(type: LightType, index: number): SceneLight {
  const base = {
    id: crypto.randomUUID(),
    type,
    color: '#ffffff',
    castShadow: type !== 'point',
    target: [0, 0, 0] as Vec3,
  };
  switch (type) {
    case 'directional':
      return { ...base, name: `Sun ${index}`, intensity: 2.0, position: [4, 6, 3] };
    case 'point':
      return { ...base, name: `Point ${index}`, intensity: 8, position: [-2, 2.5, 2] };
    case 'spot':
      return { ...base, name: `Spot ${index}`, intensity: 12, position: [0, 4, 2], angle: 35, penumbra: 0.4 };
  }
}

export function defaultSceneData(): SceneData {
  return {
    version: 2,
    nodes: [],
    lights: [
      { ...makeLight('directional', 1), id: crypto.randomUUID() },
    ],
    environment: { ...DEFAULT_ENVIRONMENT },
    camera: { ...DEFAULT_CAMERA, position: [...DEFAULT_CAMERA.position] as Vec3, target: [...DEFAULT_CAMERA.target] as Vec3 },
  };
}

const isVec3 = (v: any): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && isFinite(n));

const vec3 = (v: any, fallback: Vec3): Vec3 => (isVec3(v) ? [v[0], v[1], v[2]] : [...fallback] as Vec3);

/** Accept any historical/partial sceneData and return a well-formed v2 doc. */
export function migrateSceneData(raw: any): SceneData {
  const out = defaultSceneData();
  if (!raw || typeof raw !== 'object') return out;

  out.nodes = Array.isArray(raw.nodes)
    ? raw.nodes
        .filter((n: any) => n && typeof n.resultUrl === 'string' && n.resultUrl)
        .map((n: any) => ({
          id: typeof n.id === 'string' ? n.id : crypto.randomUUID(),
          jobId: String(n.jobId || ''),
          name: String(n.name || 'Object'),
          resultUrl: n.resultUrl,
          position: vec3(n.position, [0, 0, 0]),
          rotation: vec3(n.rotation, [0, 0, 0]),
          scale: vec3(n.scale, [1, 1, 1]),
          visible: n.visible !== false,
          pivotCenter: n.pivotCenter === true,
        }))
    : [];

  if (Array.isArray(raw.lights) && raw.lights.length > 0) {
    // v2 document
    out.lights = raw.lights.map((l: any, i: number) => {
      const type: LightType = l.type === 'point' || l.type === 'spot' ? l.type : 'directional';
      const seed = makeLight(type, i + 1);
      return {
        ...seed,
        id: typeof l.id === 'string' ? l.id : seed.id,
        name: String(l.name || seed.name),
        color: typeof l.color === 'string' ? l.color : seed.color,
        intensity: typeof l.intensity === 'number' ? l.intensity : seed.intensity,
        position: vec3(l.position, seed.position),
        target: vec3(l.target, seed.target),
        castShadow: typeof l.castShadow === 'boolean' ? l.castShadow : seed.castShadow,
        angle: typeof l.angle === 'number' ? l.angle : seed.angle,
        penumbra: typeof l.penumbra === 'number' ? l.penumbra : seed.penumbra,
      };
    });
    if (raw.environment && typeof raw.environment === 'object') {
      const e = raw.environment;
      out.environment = {
        background: typeof e.background === 'string' ? e.background : out.environment.background,
        ambientColor: typeof e.ambientColor === 'string' ? e.ambientColor : out.environment.ambientColor,
        ambientIntensity: typeof e.ambientIntensity === 'number' ? e.ambientIntensity : out.environment.ambientIntensity,
        showGrid: e.showGrid !== false,
        showGround: e.showGround !== false,
      };
    }
  } else if (raw.lighting && typeof raw.lighting === 'object') {
    // v1 document: { lighting: { ambientIntensity, keyIntensity, keyAzimuth, keyElevation, background } }
    const l = raw.lighting;
    const az = ((typeof l.keyAzimuth === 'number' ? l.keyAzimuth : 45) * Math.PI) / 180;
    const el = ((typeof l.keyElevation === 'number' ? l.keyElevation : 55) * Math.PI) / 180;
    const r = 7;
    out.lights = [{
      ...makeLight('directional', 1),
      intensity: typeof l.keyIntensity === 'number' ? l.keyIntensity : 2.2,
      position: [
        r * Math.cos(el) * Math.cos(az),
        Math.max(0.5, r * Math.sin(el)),
        r * Math.cos(el) * Math.sin(az),
      ],
    }];
    out.environment.ambientIntensity = typeof l.ambientIntensity === 'number' ? l.ambientIntensity : 0.9;
    if (typeof l.background === 'string') out.environment.background = l.background;
  }

  if (raw.camera && typeof raw.camera === 'object') {
    out.camera = {
      position: vec3(raw.camera.position, DEFAULT_CAMERA.position),
      target: vec3(raw.camera.target, DEFAULT_CAMERA.target),
      fov: typeof raw.camera.fov === 'number' ? raw.camera.fov : DEFAULT_CAMERA.fov,
    };
  }

  return out;
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
