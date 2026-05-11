// ─────────────────────────────────────────────────────────────────────────────
// Worker registry — in-memory state for the multi-worker control plane.
//
// When a worker boots it POSTs /api/workers/register with its id, the list of
// models it can serve, and its concurrent-job capacity. We keep that in a
// process-local Map. If the server restarts, workers just re-register on
// their next claim attempt — no persistence needed.
//
// Routing logic lives in workersApi.ts; this module is intentionally a dumb
// data store with no Express dependencies.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerState {
  id: string;
  models: string[];
  capacity: number;
  busy: number;
  registeredAt: number; // epoch ms
  lastSeen: number;     // epoch ms — bumped by /claim, /progress, /heartbeat
  activeJobIds: Set<string>;
}

const workers = new Map<string, WorkerState>();

export function registerWorker(input: {
  id: string;
  models: string[];
  capacity: number;
}): WorkerState {
  const now = Date.now();
  const existing = workers.get(input.id);
  // Re-registering is allowed (worker restart). Reset capacity/models from the
  // new payload but keep activeJobIds — if the worker re-registers mid-job
  // the server still knows the job is its responsibility. (In practice a
  // restarted worker has no active jobs; the stale reaper handles those.)
  const state: WorkerState = {
    id: input.id,
    models: [...input.models],
    capacity: input.capacity,
    busy: existing?.busy ?? 0,
    registeredAt: existing?.registeredAt ?? now,
    lastSeen: now,
    activeJobIds: existing?.activeJobIds ?? new Set(),
  };
  workers.set(input.id, state);
  return state;
}

export function getWorker(id: string): WorkerState | undefined {
  return workers.get(id);
}

export function listWorkers(): WorkerState[] {
  return Array.from(workers.values());
}

export function touchWorker(id: string): void {
  const w = workers.get(id);
  if (w) w.lastSeen = Date.now();
}

// Called when /claim returns a job to a worker.
export function markBusy(id: string, jobId: string): void {
  const w = workers.get(id);
  if (!w) return;
  if (!w.activeJobIds.has(jobId)) {
    w.activeJobIds.add(jobId);
    w.busy = w.activeJobIds.size;
  }
  w.lastSeen = Date.now();
}

// Called when /complete fires for a job.
export function markFree(id: string, jobId: string): void {
  const w = workers.get(id);
  if (!w) return;
  if (w.activeJobIds.delete(jobId)) {
    w.busy = w.activeJobIds.size;
  }
  w.lastSeen = Date.now();
}

// Convert to a JSON-safe shape for the admin endpoint (Set isn't serializable).
export function workerToJson(w: WorkerState) {
  return {
    id: w.id,
    models: w.models,
    capacity: w.capacity,
    busy: w.busy,
    registeredAt: new Date(w.registeredAt).toISOString(),
    lastSeen: new Date(w.lastSeen).toISOString(),
    secondsSinceSeen: Math.round((Date.now() - w.lastSeen) / 1000),
    activeJobIds: Array.from(w.activeJobIds),
  };
}
