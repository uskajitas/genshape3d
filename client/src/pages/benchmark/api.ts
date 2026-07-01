const BASE = '/api/benchmark';

export interface RatingDimension {
  id: string; key: string; label: string; description: string;
  sort_order: number; active: boolean;
}

export interface BenchmarkCategory {
  id: string; name: string; parentId: string | null;
  sort_order: number; children?: BenchmarkCategory[];
}

export interface BenchmarkSubject {
  id: string; categoryId: string; categoryName?: string;
  parentCategoryName?: string; name: string;
  generationPrompt: string; imageUrl: string; notes: string;
  createdAt: string; runCount?: number;
}

export interface BenchmarkRun {
  id: string; name: string; configSnapshot: any;
  createdAt: string; completedAt: string | null;
  totalItems?: number; doneItems?: number; ratedItems?: number;
}

export interface BenchmarkRunItem {
  id: string; runId: string; subjectId: string; jobId: string | null;
  model: string; preset: string;
  octree: number; steps: number; guidance: number; faces: number; chunks: number; seed: number;
  ratings: Record<string, number> | null; ratingNotes: string;
  ratedAt: string | null; createdAt: string;
  subjectName?: string; subjectImageUrl?: string; subjectCategoryId?: string;
  jobStatus?: string; jobResultUrl?: string;
  jobStartedAt?: string | null; jobCompletedAt?: string | null;
  jobAuxImageUrls?: string[];
}

export interface CreateRunPayload {
  email: string; name: string;
  items: Array<{
    subjectId: string; model: string; preset: string;
    octree: number; steps: number; guidance: number;
    faces: number; chunks: number; seed: number;
    doTexture?: boolean;
  }>;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function post<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function patch<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function del(path: string, query?: Record<string, string>): Promise<void> {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const r = await fetch(`${BASE}${path}${qs}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
}

export const benchmarkApi = {
  getDimensions: () => get<RatingDimension[]>('/dimensions'),
  addDimension: (email: string, data: { key: string; label: string; description?: string }) =>
    post<RatingDimension>('/dimensions', { email, ...data }),

  getCategories: () => get<BenchmarkCategory[]>('/categories'),

  getSubjects: () => get<BenchmarkSubject[]>('/subjects'),
  getSubject: (id: string) => get<BenchmarkSubject>(`/subjects/${id}`),
  createSubject: (email: string, data: Partial<BenchmarkSubject>) =>
    post<BenchmarkSubject>('/subjects', { email, ...data }),
  updateSubject: (email: string, id: string, data: Partial<BenchmarkSubject>) =>
    patch<{ ok: boolean }>(`/subjects/${id}`, { email, ...data }),
  deleteSubject: (email: string, id: string) =>
    del(`/subjects/${id}`, { email }),

  getRuns: () => get<BenchmarkRun[]>('/runs'),
  getRun: (id: string) => get<BenchmarkRun>(`/runs/${id}`),
  getRunItems: (id: string) => get<BenchmarkRunItem[]>(`/runs/${id}/items`),
  createRun: (payload: CreateRunPayload) => post<BenchmarkRun>('/runs', payload),
  exportRun: (id: string) => `${BASE}/runs/${id}/export`,

  rateItem: (email: string, id: string, ratings: Record<string, number>, ratingNotes: string) =>
    patch<{ ok: boolean }>(`/items/${id}/rate`, { email, ratings, ratingNotes }),
};
