// ─────────────────────────────────────────────────────────────────────────────
// AdminStats — admin-only stats page.
//
// Layout:
//   - small headline cards (right-now numbers only)
//   - ONE filterable table of every job in the last 30 days
//
// Filters: time range (today / 7d / 30d), status, quality, texture.
// Source: GET /api/admin/stats — already returns up to 500 recent rows.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { useAppUser } from '../context/UserContext';

interface RecentRow {
  id: string;
  email: string;
  name: string;
  image_url: string;
  model: string;
  worker: string;
  preferred_worker: string;
  status: string;
  progress_pct: number;
  progress_phase: string;
  error_message: string;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
  steps: number;
  octree: number;
  tex: boolean;
}

interface StatsResp {
  generatedAt: string;
  users: { total_users: number; new_7d: number; new_24h: number };
  active: { active_7d: number; active_24h: number };
  queue: { pending: number; processing: number };
  recent: RecentRow[];
}

interface WorkerInfo {
  id: string;
  models: string[];
  capacity: number;
  busy: number;
  lastActivity: string | null;
  online: boolean;
}

interface WorkersResp {
  generatedAt: string;
  workers: WorkerInfo[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Styled
// ─────────────────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background:
    radial-gradient(ellipse 70% 50% at 50% 0%, ${p => p.theme.colors.primary}14, transparent 60%),
    ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font-family: 'Inter', sans-serif;
  padding: 1.5rem 2rem 4rem;
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const Back = styled(Link)`
  font-size: 0.85rem;
  color: ${p => p.theme.colors.textMuted};
  text-decoration: none;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const Title = styled.h1`
  font-size: 1.4rem;
  font-weight: 800;
  margin: 0;
  letter-spacing: -0.02em;
`;

const Updated = styled.span`
  margin-left: auto;
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
`;

const Cards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const Card = styled.div`
  background: linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  padding: 0.85rem 1rem;
`;

const CardLabel = styled.div`
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.2rem;
`;

const CardValue = styled.div`
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
`;

const CardSub = styled.div`
  font-size: 0.74rem;
  color: ${p => p.theme.colors.textMuted};
  margin-top: 0.15rem;
`;

const Filters = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
`;

const FilterLabel = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  color: ${p => p.theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-right: 0.25rem;
`;

const FilterBtn = styled.button<{ $active?: boolean }>`
  font: inherit;
  cursor: pointer;
  padding: 0.32rem 0.7rem;
  border-radius: 6px;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active
    ? `${p.theme.colors.violet}24`
    : p.theme.colors.background};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  font-size: 0.78rem;
  font-weight: 600;
  &:hover { color: ${p => p.theme.colors.text}; border-color: ${p => p.theme.colors.violet}; }
`;

const Sep = styled.span`
  width: 1px;
  align-self: stretch;
  background: ${p => p.theme.colors.border};
  margin: 0 0.4rem;
`;

const Count = styled.span`
  margin-left: auto;
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  overflow: hidden;
`;

const Th = styled.th`
  text-align: left;
  padding: 0.55rem 0.85rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${p => p.theme.colors.textMuted};
  background: ${p => p.theme.colors.surfaceHigh};
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

const Td = styled.td`
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

const Pill = styled.span<{ $color?: string }>`
  display: inline-block;
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  background: ${p => (p.$color || p.theme.colors.primary)}1f;
  color: ${p => p.$color || p.theme.colors.primaryLight};
  border: 1px solid ${p => (p.$color || p.theme.colors.primary)}55;
  font-size: 0.7rem;
  font-weight: 600;
`;

const Loading = styled.div`
  padding: 2rem;
  color: ${p => p.theme.colors.textMuted};
  text-align: center;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtSec = (s: number): string => {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};

const statusColor = (s: string): string => {
  switch (s) {
    case 'done': return '#10B981';
    case 'failed':
    case 'error': return '#EF4444';
    case 'cancelled': return '#6B7280';
    case 'processing': return '#A855F7';
    case 'pending': return '#EC4899';
    default: return '#A4A4AC';
  }
};

type TimeRange = 'today' | '7d' | '30d';
type StatusFilter = 'all' | 'done' | 'processing' | 'failed' | 'cancelled';
type QualityFilter = 'all' | 'standard' | 'high';
type TexFilter = 'all' | 'on' | 'off';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const AdminStats: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { appUser } = useAppUser();
  const navigate = useNavigate();

  const [stats, setStats] = useState<StatsResp | null>(null);
  const [workers, setWorkers] = useState<WorkersResp | null>(null);
  const [error, setError] = useState<string>('');

  // Filters
  const [time, setTime] = useState<TimeRange>('7d');
  const [statusF, setStatusF] = useState<StatusFilter>('all');
  const [qualF, setQualF] = useState<QualityFilter>('all');
  const [texF, setTexF] = useState<TexFilter>('all');

  // Auth gate
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (appUser.loaded && appUser.role !== 'admin') { navigate('/dashboard'); return; }
  }, [isAuthenticated, appUser, navigate]);

  // Fetch every 3s (live view of running jobs + worker state)
  useEffect(() => {
    const email = user?.email;
    if (!email || appUser.role !== 'admin') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [s, w] = await Promise.all([
          fetch('/api/admin/stats',                        { headers: { 'x-user-email': email } }),
          fetch(`/api/workers?email=${encodeURIComponent(email)}`),
        ]);
        if (!s.ok) throw new Error(`stats HTTP ${s.status}`);
        const sd: StatsResp = await s.json();
        if (!cancelled) { setStats(sd); setError(''); }
        if (w.ok) {
          const wd: WorkersResp = await w.json();
          if (!cancelled) setWorkers(wd);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user?.email, appUser.role]);

  // For each worker, find the row it's currently processing (if any)
  const activeByWorker = useMemo<Record<string, RecentRow | undefined>>(() => {
    const out: Record<string, RecentRow | undefined> = {};
    if (!stats?.recent) return out;
    for (const r of stats.recent) {
      if (r.status === 'processing' && r.worker && !out[r.worker]) {
        out[r.worker] = r;
      }
    }
    return out;
  }, [stats]);

  const lastSeenLabel = (iso: string | null): string => {
    if (!iso) return 'never';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60)    return `${s}s ago`;
    if (s < 3600)  return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  };

  const filtered = useMemo<RecentRow[]>(() => {
    if (!stats?.recent) return [];
    const cutoffMs =
      time === 'today' ? Date.now() - 24 * 3600 * 1000
      : time === '7d'  ? Date.now() -  7 * 86400 * 1000
                       : Date.now() - 30 * 86400 * 1000;

    return stats.recent.filter(r => {
      if (new Date(r.submitted_at).getTime() < cutoffMs) return false;
      if (statusF !== 'all' && r.status !== statusF) return false;
      const isHigh = (r.steps || 0) > 10;
      if (qualF === 'standard' && isHigh) return false;
      if (qualF === 'high' && !isHigh) return false;
      if (texF === 'on' && !r.tex) return false;
      if (texF === 'off' && r.tex) return false;
      return true;
    });
  }, [stats, time, statusF, qualF, texF]);

  if (!stats) return (
    <Page>
      <TopBar><Back to="/dashboard">← Workspace</Back><Title>Stats</Title></TopBar>
      <Loading>{error || 'Loading…'}</Loading>
    </Page>
  );

  return (
    <Page>
      <TopBar>
        <Back to="/dashboard">← Workspace</Back>
        <Title>Stats</Title>
        <Updated>updated {new Date(stats.generatedAt).toLocaleTimeString()}</Updated>
      </TopBar>

      {/* ── Machines panel ───────────────────────────────────────────────── */}
      {workers && workers.workers.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          {workers.workers.map(w => {
            const active = activeByWorker[w.id];
            const staleSec = active
              ? Math.round((Date.now() - new Date(active.submitted_at).getTime()) / 1000)
              : 0;
            return (
              <div
                key={w.id}
                style={{
                  background: 'linear-gradient(180deg, #1A1B22, #14151B)',
                  border: `1px solid ${w.online ? '#10B98155' : '#EF444455'}`,
                  borderRadius: 10,
                  padding: '0.9rem 1rem',
                  display: 'flex',
                  gap: '0.85rem',
                  alignItems: 'flex-start',
                }}
              >
                {active && active.image_url ? (
                  <a href={active.image_url} target="_blank" rel="noreferrer">
                    <img
                      src={active.image_url}
                      alt=""
                      style={{
                        width: 64, height: 64, objectFit: 'cover',
                        borderRadius: 8, background: '#222', flexShrink: 0,
                      }}
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <div
                    style={{
                      width: 64, height: 64, borderRadius: 8,
                      background: '#222',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#6B7280', fontSize: '0.7rem', flexShrink: 0,
                    }}
                  >
                    idle
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: w.online ? '#10B981' : '#EF4444',
                        boxShadow: w.online ? '0 0 8px #10B981' : 'none',
                      }}
                    />
                    <strong style={{ fontSize: '0.95rem' }}>{w.id}</strong>
                    <span style={{ fontSize: '0.72rem', color: '#A4A4AC' }}>
                      {w.online ? 'online' : 'offline'} · last activity {lastSeenLabel(w.lastActivity)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#A4A4AC', marginBottom: 6 }}>
                    runs: {w.models.join(', ')}
                  </div>
                  {active ? (
                    <>
                      <div
                        style={{
                          fontSize: '0.85rem', fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {active.name || active.id.slice(0, 8)}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#A4A4AC', marginBottom: 6 }}>
                        {active.model} · {active.progress_pct || 0}% ·{' '}
                        {active.progress_phase || '…'}
                      </div>
                      <div
                        style={{
                          height: 6, background: '#22232A', borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, active.progress_pct || 0)}%`,
                            height: '100%',
                            background: staleSec > 1800 ? '#F59E0B' : '#A855F7',
                            transition: 'width 0.4s',
                          }}
                        />
                      </div>
                      {staleSec > 1800 && (
                        <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#F59E0B' }}>
                          ⚠ in progress for {Math.round(staleSec / 60)}m — may be
                          downloading model weights on cold start
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                      {w.busy > 0 ? `${w.busy} active jobs` : 'idle, waiting for work'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Right-now headline cards */}
      <Cards>
        <Card>
          <CardLabel>Queue depth</CardLabel>
          <CardValue>{stats.queue.pending + stats.queue.processing}</CardValue>
          <CardSub>{stats.queue.processing} running · {stats.queue.pending} pending</CardSub>
        </Card>
        <Card>
          <CardLabel>Active 24h</CardLabel>
          <CardValue>{stats.active.active_24h}</CardValue>
          <CardSub>users who submitted</CardSub>
        </Card>
        <Card>
          <CardLabel>Active 7d</CardLabel>
          <CardValue>{stats.active.active_7d}</CardValue>
          <CardSub>users who submitted</CardSub>
        </Card>
        <Card>
          <CardLabel>Total users</CardLabel>
          <CardValue>{stats.users.total_users}</CardValue>
          <CardSub>+{stats.users.new_24h} today · +{stats.users.new_7d} week</CardSub>
        </Card>
      </Cards>

      {/* Filters */}
      <Filters>
        <FilterLabel>Time</FilterLabel>
        <FilterBtn $active={time === 'today'} onClick={() => setTime('today')}>Today</FilterBtn>
        <FilterBtn $active={time === '7d'}    onClick={() => setTime('7d')}>7 days</FilterBtn>
        <FilterBtn $active={time === '30d'}   onClick={() => setTime('30d')}>30 days</FilterBtn>

        <Sep />

        <FilterLabel>Status</FilterLabel>
        <FilterBtn $active={statusF === 'all'}        onClick={() => setStatusF('all')}>All</FilterBtn>
        <FilterBtn $active={statusF === 'done'}       onClick={() => setStatusF('done')}>Done</FilterBtn>
        <FilterBtn $active={statusF === 'processing'} onClick={() => setStatusF('processing')}>Running</FilterBtn>
        <FilterBtn $active={statusF === 'failed'}     onClick={() => setStatusF('failed')}>Failed</FilterBtn>
        <FilterBtn $active={statusF === 'cancelled'}  onClick={() => setStatusF('cancelled')}>Cancelled</FilterBtn>

        <Sep />

        <FilterLabel>Quality</FilterLabel>
        <FilterBtn $active={qualF === 'all'}      onClick={() => setQualF('all')}>All</FilterBtn>
        <FilterBtn $active={qualF === 'standard'} onClick={() => setQualF('standard')}>Standard</FilterBtn>
        <FilterBtn $active={qualF === 'high'}     onClick={() => setQualF('high')}>High</FilterBtn>

        <Sep />

        <FilterLabel>Texture</FilterLabel>
        <FilterBtn $active={texF === 'all'} onClick={() => setTexF('all')}>All</FilterBtn>
        <FilterBtn $active={texF === 'on'}  onClick={() => setTexF('on')}>On</FilterBtn>
        <FilterBtn $active={texF === 'off'} onClick={() => setTexF('off')}>Off</FilterBtn>

        <Count>{filtered.length} of {stats.recent.length} rows</Count>
      </Filters>

      {/* The one table */}
      <Table>
        <thead>
          <tr>
            <Th style={{ width: '56px' }}>Img</Th>
            <Th>Name</Th>
            <Th>Submitted</Th>
            <Th>User</Th>
            <Th>Model</Th>
            <Th>Worker</Th>
            <Th>Status</Th>
            <Th>Progress</Th>
            <Th>Run time</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const ran =
              r.status === 'done' && r.started_at && r.completed_at
                ? Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                : null;
            const workerLabel = r.worker || (r.preferred_worker ? `→ ${r.preferred_worker}` : '—');
            return (
              <tr key={r.id}>
                <Td>
                  {r.image_url ? (
                    <a href={r.image_url} target="_blank" rel="noreferrer">
                      <img
                        src={r.image_url}
                        alt=""
                        style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, background: '#222' }}
                        loading="lazy"
                      />
                    </a>
                  ) : '—'}
                </Td>
                <Td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name || <span style={{ color: '#6B7280' }}>—</span>}
                </Td>
                <Td>{new Date(r.submitted_at).toLocaleString()}</Td>
                <Td>{r.email}</Td>
                <Td><Pill>{r.model || '—'}</Pill></Td>
                <Td>
                  <Pill $color={r.worker ? '#A855F7' : '#6B7280'}>{workerLabel}</Pill>
                </Td>
                <Td>
                  <Pill $color={statusColor(r.status)}>{r.status}</Pill>
                  {r.status === 'failed' && r.error_message && (
                    <div
                      title={r.error_message}
                      style={{
                        marginTop: 4, maxWidth: 240, color: '#EF4444',
                        fontSize: '0.72rem', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {r.error_message}
                    </div>
                  )}
                </Td>
                <Td>
                  {r.status === 'processing'
                    ? `${r.progress_pct || 0}% ${r.progress_phase || ''}`
                    : r.status === 'done' ? '100%' : '—'}
                </Td>
                <Td>{ran ? fmtSec(ran) : '—'}</Td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><Td colSpan={9} style={{ textAlign: 'center', color: '#A4A4AC', padding: '1.5rem' }}>
              No rows match the current filters.
            </Td></tr>
          )}
        </tbody>
      </Table>
    </Page>
  );
};

export default AdminStats;
