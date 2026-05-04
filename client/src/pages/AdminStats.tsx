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
  status: string;
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

  // Fetch every 10s
  useEffect(() => {
    const email = user?.email;
    if (!email || appUser.role !== 'admin') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch('/api/admin/stats', { headers: { 'x-user-email': email } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: StatsResp = await r.json();
        if (!cancelled) { setStats(data); setError(''); }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    };
    tick();
    const t = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user?.email, appUser.role]);

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
            <Th>Submitted</Th>
            <Th>User</Th>
            <Th>Status</Th>
            <Th>Quality</Th>
            <Th>Texture</Th>
            <Th>Run time</Th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => {
            const isHigh = (r.steps || 0) > 10;
            const ran =
              r.status === 'done' && r.started_at && r.completed_at
                ? Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                : null;
            return (
              <tr key={r.id}>
                <Td>{new Date(r.submitted_at).toLocaleString()}</Td>
                <Td>{r.email}</Td>
                <Td><Pill $color={statusColor(r.status)}>{r.status}</Pill></Td>
                <Td><Pill $color={isHigh ? '#C084FC' : '#A4A4AC'}>{isHigh ? 'high' : 'standard'}</Pill></Td>
                <Td><Pill $color={r.tex ? '#EC4899' : '#6B7280'}>{r.tex ? 'on' : 'off'}</Pill></Td>
                <Td>{ran ? fmtSec(ran) : '—'}</Td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr><Td colSpan={6} style={{ textAlign: 'center', color: '#A4A4AC', padding: '1.5rem' }}>
              No rows match the current filters.
            </Td></tr>
          )}
        </tbody>
      </Table>
    </Page>
  );
};

export default AdminStats;
