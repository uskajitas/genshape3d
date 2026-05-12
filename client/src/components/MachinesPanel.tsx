// ─────────────────────────────────────────────────────────────────────────────
// MachinesPanel — admin-only live worker status strip.
//
// Always-visible "what is each machine doing right now" view. Renders a card
// per known worker (i7-1080, win-3090) showing:
//   - 🟢/🔴 online dot + last activity time
//   - models the worker can run
//   - if busy: thumbnail of input image, job name, model, live % + phase,
//     progress bar, cold-start warning after 30 min in progress
//   - if idle: 'idle, waiting for work'
//
// Sources: GET /api/workers (admin gated by ?email=) + GET /api/admin/stats
// (admin gated by x-user-email header) joined by assignedWorkerId.
// Refreshes every 3 seconds.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';

interface WorkerInfo {
  id: string;
  models: string[];
  capacity: number;
  busy: number;
  lastActivity: string | null;
  online: boolean;
}

interface RecentRow {
  id: string;
  name: string;
  image_url: string;
  model: string;
  worker: string;
  status: string;
  progress_pct: number;
  progress_phase: string;
  submitted_at: string;
  steps: number;
  octree: number;
  tex: boolean;
}

interface Props {
  email: string;
  isAdmin: boolean;
  compact?: boolean;
}

// R2 URLs like `https://<r2>/genshape3d/uploads/xxx.png` are NOT publicly
// fetchable from a browser — the bucket isn't public. The server exposes
// `/api/image?key=uploads/xxx.png` which proxies the bytes. Convert before
// using as an <img src>.
const toProxyUrl = (raw?: string): string | null => {
  if (!raw) return null;
  if (raw.startsWith('/api/image')) return raw;
  if (raw.includes('/uploads/')) {
    const key = `uploads/${raw.split('/uploads/')[1]}`;
    return `/api/image?key=${encodeURIComponent(key)}`;
  }
  return raw;
};

const lastSeenLabel = (iso: string | null): string => {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export const MachinesPanel: React.FC<Props> = ({ email, isAdmin, compact }) => {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [recent, setRecent]   = useState<RecentRow[]>([]);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [w, s] = await Promise.all([
          fetch(`/api/workers?email=${encodeURIComponent(email)}`),
          fetch('/api/admin/stats', { headers: { 'x-user-email': email } }),
        ]);
        if (!cancelled && w.ok) {
          const wd = await w.json();
          setWorkers(wd.workers || []);
        }
        if (!cancelled && s.ok) {
          const sd = await s.json();
          setRecent(sd.recent || []);
        }
      } catch { /* swallow — next tick retries */ }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, [email, isAdmin]);

  const activeByWorker = useMemo<Record<string, RecentRow | undefined>>(() => {
    const out: Record<string, RecentRow | undefined> = {};
    for (const r of recent) {
      if (r.status === 'processing' && r.worker && !out[r.worker]) out[r.worker] = r;
    }
    return out;
  }, [recent]);

  if (!email) return null;

  return (
    <div
      style={{
        margin: compact ? '0.5rem 1rem' : '0 0 1.25rem 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.68rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#A4A4AC',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        <span>Machines</span>
        <span style={{ flex: 1, height: 1, background: '#22232A' }} />
        <span style={{ color: '#6B7280', fontWeight: 500 }}>
          {workers.length === 0 ? 'loading…' : `${workers.length} known`}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(${compact ? 280 : 320}px, 1fr))`,
          gap: '0.65rem',
        }}
      >
      {workers.map(w => {
        const active = activeByWorker[w.id];
        const startedMs = active ? new Date(active.submitted_at).getTime() : 0;
        const inProgressSec = active ? Math.round((Date.now() - startedMs) / 1000) : 0;
        const isStale = active && inProgressSec > 1800;
        return (
          <div
            key={w.id}
            style={{
              background: 'linear-gradient(180deg, #1A1B22, #14151B)',
              border: `1px solid ${w.online ? '#10B98155' : '#EF444455'}`,
              borderRadius: 10,
              padding: '0.75rem 0.9rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
            }}
          >
            {active && active.image_url ? (
              <a href={toProxyUrl(active.image_url) || '#'} target="_blank" rel="noreferrer">
                <img
                  src={toProxyUrl(active.image_url) || ''}
                  alt=""
                  style={{
                    width: 56, height: 56, objectFit: 'cover',
                    borderRadius: 8, background: '#222', flexShrink: 0,
                  }}
                  loading="lazy"
                />
              </a>
            ) : (
              <div
                style={{
                  width: 56, height: 56, borderRadius: 8, background: '#222',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#6B7280', fontSize: '0.68rem', flexShrink: 0,
                }}
              >
                idle
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: w.online ? '#10B981' : '#EF4444',
                    boxShadow: w.online ? '0 0 8px #10B981' : 'none',
                  }}
                />
                <strong style={{ fontSize: '0.88rem' }}>{w.id}</strong>
                <span style={{ fontSize: '0.66rem', color: '#A4A4AC', marginLeft: 'auto' }}>
                  {w.online ? 'online' : 'offline'} · {lastSeenLabel(w.lastActivity)}
                </span>
              </div>
              <div style={{ fontSize: '0.66rem', color: '#A4A4AC', marginBottom: 4 }}>
                runs: {w.models.join(', ')}
              </div>
              {active ? (
                <>
                  <div
                    style={{
                      fontSize: '0.8rem', fontWeight: 600, color: '#E4E4E7',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                    title={active.name || active.id}
                  >
                    {active.name || active.id.slice(0, 8)}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '3px 0' }}>
                    <span
                      style={{
                        padding: '1px 6px', borderRadius: 4, fontSize: '0.6rem',
                        fontWeight: 700, letterSpacing: '0.04em',
                        background: active.tex ? '#EC4899' : '#374151',
                        color: active.tex ? '#fff' : '#9CA3AF',
                      }}
                    >
                      {active.tex ? 'TEXTURED' : 'NO TEX'}
                    </span>
                    <span
                      style={{
                        padding: '1px 6px', borderRadius: 4, fontSize: '0.6rem',
                        fontWeight: 700, letterSpacing: '0.04em',
                        background: (active.steps || 0) > 10 ? '#C084FC' : '#374151',
                        color: (active.steps || 0) > 10 ? '#fff' : '#9CA3AF',
                      }}
                    >
                      {(active.steps || 0) > 10 ? 'HIGH' : 'STD'}
                    </span>
                    <span
                      style={{
                        padding: '1px 6px', borderRadius: 4, fontSize: '0.6rem',
                        fontWeight: 700, background: '#1F2937', color: '#9CA3AF',
                      }}
                    >
                      {active.model}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#A4A4AC', marginBottom: 4 }}>
                    {active.progress_pct || 0}% · {active.progress_phase || '…'}
                    {active.octree ? ` · octree ${active.octree}` : ''}
                    {active.steps ? ` · ${active.steps} steps` : ''}
                  </div>
                  <div
                    style={{
                      height: 5, background: '#22232A', borderRadius: 3, overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, active.progress_pct || 0)}%`,
                        height: '100%',
                        background: isStale ? '#F59E0B' : '#A855F7',
                        transition: 'width 0.4s',
                      }}
                    />
                  </div>
                  {isStale && (
                    <div style={{ marginTop: 4, fontSize: '0.66rem', color: '#F59E0B' }}>
                      ⚠ in progress {Math.round(inProgressSec / 60)}m — likely
                      downloading model weights (cold start)
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>
                  {w.busy > 0 ? `${w.busy} active jobs` : 'idle, waiting for work'}
                </div>
              )}
            </div>
          </div>
        );
      })}
        {workers.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '0.8rem 1rem',
              background: '#1A1B22',
              border: '1px dashed #22232A',
              borderRadius: 10,
              fontSize: '0.78rem',
              color: '#6B7280',
              textAlign: 'center',
            }}
          >
            No worker data yet — fetching… (admin sign-in required to load /api/workers).
          </div>
        )}
      </div>
    </div>
  );
};

export default MachinesPanel;
