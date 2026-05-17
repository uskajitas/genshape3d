import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Link, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { useAppUser } from '../../context/UserContext';
import { BenchmarkSubjects } from './Subjects';
import { BenchmarkNewRun } from './NewRun';
import { BenchmarkRunResults } from './RunResults';
import { benchmarkApi, BenchmarkRun } from './api';

// ─── Shell layout ─────────────────────────────────────────────────────────────

const Shell = styled.div`
  min-height: 100vh;
  background: ${p => p.theme.colors.background};
  display: flex; flex-direction: column;
`;

const Nav = styled.nav`
  display: flex; align-items: center; gap: 0;
  padding: 0 1.5rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  flex-shrink: 0;
`;

const Logo = styled(Link)`
  font-size: 0.88rem; font-weight: 800;
  color: ${p => p.theme.colors.text};
  text-decoration: none; padding: 0.9rem 0;
  margin-right: 1.5rem;
  span { color: ${p => p.theme.colors.violet}; }
`;

const NavLink = styled(Link)<{ $active?: boolean }>`
  font-size: 0.82rem; font-weight: 600; text-decoration: none;
  padding: 0.9rem 1rem;
  color: ${p => p.$active ? p.theme.colors.violet : p.theme.colors.textMuted};
  border-bottom: 2px solid ${p => p.$active ? p.theme.colors.violet : 'transparent'};
  transition: color 0.15s;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const Content = styled.div`
  flex: 1; overflow: auto;
`;

// ─── Run history page ─────────────────────────────────────────────────────────

const Page = styled.div`
  padding: 2rem; max-width: 900px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 1.5rem;
`;

const TopBar = styled.div`
  display: flex; align-items: center; gap: 1rem;
`;

const PageTitle = styled.h1`
  font-size: 1.3rem; font-weight: 800; margin: 0; flex: 1;
  color: ${p => p.theme.colors.text};
`;

const Btn = styled(Link)`
  font: inherit; font-size: 0.82rem; font-weight: 600;
  padding: 0.5rem 1.1rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p => p.theme.colors.violet};
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white; text-decoration: none;
  &:hover { opacity: 0.85; }
`;

const RunCard = styled(Link)`
  display: flex; align-items: center; gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  text-decoration: none;
  transition: border-color 0.15s;
  &:hover { border-color: ${p => p.theme.colors.borderHigh}; }
`;

const RunName = styled.div`
  font-size: 0.92rem; font-weight: 700; color: ${p => p.theme.colors.text};
`;

const RunMeta = styled.div`
  font-size: 0.72rem; color: ${p => p.theme.colors.textMuted};
`;

const RunStats = styled.div`
  margin-left: auto; display: flex; gap: 1.25rem; align-items: center;
`;

const Stat = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 1px;
`;

const StatVal = styled.div`
  font-size: 1rem; font-weight: 800; color: ${p => p.theme.colors.violet};
`;

const StatLabel = styled.div`
  font-size: 0.62rem; color: ${p => p.theme.colors.textMuted};
`;

const MiniBar = styled.div<{ $pct: number }>`
  width: 80px; height: 4px; border-radius: 2px;
  background: ${p => p.theme.colors.border}; position: relative; overflow: hidden;
  &::after {
    content: ''; position: absolute; inset: 0 auto 0 0;
    width: ${p => p.$pct}%;
    background: linear-gradient(90deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  }
`;

const RunHistory: React.FC = () => {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    benchmarkApi.getRuns().then(setRuns).finally(() => setLoading(false));
  }, []);

  return (
    <Page>
      <TopBar>
        <PageTitle>Benchmark runs</PageTitle>
        <Btn to="/benchmark/runs/new">+ New run</Btn>
      </TopBar>

      {loading ? (
        <div style={{ color: '#71717a', fontSize: '0.85rem' }}>Loading…</div>
      ) : runs.length === 0 ? (
        <div style={{ color: '#71717a', fontSize: '0.85rem' }}>
          No runs yet. Start by adding subjects in the Subject Library, then create a new run.
        </div>
      ) : (
        runs.map(run => {
          const total = run.totalItems ?? 0;
          const done = run.doneItems ?? 0;
          const rated = run.ratedItems ?? 0;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <RunCard key={run.id} to={`/benchmark/runs/${run.id}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <RunName>{run.name}</RunName>
                <RunMeta>{new Date(run.createdAt).toLocaleString()}</RunMeta>
                <MiniBar $pct={pct} />
              </div>
              <RunStats>
                <Stat><StatVal>{done}/{total}</StatVal><StatLabel>done</StatLabel></Stat>
                <Stat><StatVal>{rated}</StatVal><StatLabel>rated</StatLabel></Stat>
              </RunStats>
            </RunCard>
          );
        })
      )}
    </Page>
  );
};

// ─── Shell with nav ───────────────────────────────────────────────────────────

export const BenchmarkShell: React.FC = () => {
  const { appUser } = useAppUser();
  const location = useLocation();

  if (!appUser || appUser.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const path = location.pathname;

  return (
    <Shell>
      <Nav>
        <Logo to="/dashboard">Gen<span>Shape</span>3D</Logo>
        <NavLink to="/benchmark" $active={path === '/benchmark'}>Runs</NavLink>
        <NavLink to="/benchmark/subjects" $active={path.startsWith('/benchmark/subjects')}>Subjects</NavLink>
        <NavLink to="/benchmark/runs/new" $active={path === '/benchmark/runs/new'}>+ New run</NavLink>
      </Nav>
      <Content>
        <Routes>
          <Route index element={<RunHistory />} />
          <Route path="subjects" element={<BenchmarkSubjects />} />
          <Route path="runs/new" element={<BenchmarkNewRun />} />
          <Route path="runs/:id" element={<BenchmarkRunResults />} />
        </Routes>
      </Content>
    </Shell>
  );
};
