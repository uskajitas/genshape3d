import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import styled from 'styled-components';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Tooltip } from '../../components/Tooltip';
import { benchmarkApi, BenchmarkRun, BenchmarkRunItem, RatingDimension } from './api';

const MeshViewer = lazy(() => import('../../components/MeshViewer'));
type ViewMode = 'clay' | 'wireframe' | 'solid';

// Convert raw private R2 URLs → proxied /api/image so the browser can load them.
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
function toProxiedUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes('.r2.cloudflarestorage.com/')) {
    const match = url.match(/\.r2\.cloudflarestorage\.com\/[^/]+\/(.+)$/);
    if (match) return `${API_BASE}/api/image?key=${encodeURIComponent(match[1])}`;
  }
  if (url.startsWith('/api/')) return `${API_BASE}${url}`;
  return url;
}

// ─── Styled ───────────────────────────────────────────────────────────────────

const Page = styled.div`
  display: flex; flex-direction: column; gap: 1.5rem;
  padding: 2rem; max-width: 100%;
`;

const TopBar = styled.div`
  display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
`;

const PageTitle = styled.h1`
  font-size: 1.3rem; font-weight: 800; margin: 0; flex: 1;
  color: ${p => p.theme.colors.text};
`;

const RunMeta = styled.div`
  font-size: 0.75rem; color: ${p => p.theme.colors.textMuted};
`;

const ProgressBar = styled.div<{ $pct: number }>`
  height: 4px; border-radius: 2px;
  background: ${p => p.theme.colors.border};
  position: relative; overflow: hidden;
  &::after {
    content: ''; position: absolute; inset: 0 auto 0 0;
    width: ${p => p.$pct}%;
    background: linear-gradient(90deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
    transition: width 0.5s;
  }
`;

const Btn = styled.button<{ $primary?: boolean }>`
  font: inherit; font-size: 0.8rem; font-weight: 600;
  padding: 0.45rem 1rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p => p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.theme.colors.text};
  &:hover { opacity: 0.85; }
`;

// Grid
const GridWrap = styled.div` overflow-x: auto; `;

const GridTable = styled.table`
  border-collapse: separate; border-spacing: 0; min-width: 100%;
`;

const ColHeader = styled.th`
  padding: 0.5rem 0.75rem; text-align: center;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
  color: ${p => p.theme.colors.textMuted};
  background: ${p => p.theme.colors.surfaceHigh};
  border-bottom: 2px solid ${p => p.theme.colors.border};
  white-space: nowrap; position: sticky; top: 0; z-index: 2;
`;

const RowHeader = styled.td`
  padding: 0.5rem 0.75rem;
  font-size: 0.78rem; font-weight: 700;
  color: ${p => p.theme.colors.text};
  background: ${p => p.theme.colors.surfaceHigh};
  border-right: 2px solid ${p => p.theme.colors.border};
  white-space: nowrap; vertical-align: top; min-width: 130px;
  position: sticky; left: 0; z-index: 1;
`;

const RowSubLabel = styled.div`
  font-size: 0.66rem; color: ${p => p.theme.colors.textMuted}; font-weight: 400;
`;

const Cell = styled.td`
  padding: 0.5rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  border-right: 1px solid ${p => p.theme.colors.border};
  vertical-align: top; min-width: 160px;
`;

const CellCard = styled.div<{ $rated?: boolean; $clickable?: boolean }>`
  border-radius: 10px; overflow: hidden;
  border: 2px solid ${p => p.$rated ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  font-size: 0.72rem;
  cursor: ${p => p.$clickable ? 'pointer' : 'default'};
  transition: border-color 0.15s, transform 0.1s;
  ${p => p.$clickable && `
    &:hover { border-color: ${p.theme.colors.violet}88; transform: scale(1.01); }
  `}
`;

const CellThumb = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 1;
  background: ${p => p.theme.colors.surfaceHigh};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: cover; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  color: ${p => p.theme.colors.textMuted}; font-size: 1.8rem;
  position: relative;
`;

const ViewHint = styled.div`
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; opacity: 0; transition: opacity 0.15s;
  color: #fff; font-size: 0.75rem; font-weight: 700;
  ${CellCard}:hover & { opacity: 1; }
`;

const StatusBadge = styled.span<{ $status?: string }>`
  display: inline-block; padding: 2px 6px; border-radius: 4px;
  font-size: 0.65rem; font-weight: 700;
  background: ${p =>
    p.$status === 'done' ? '#16a34a22' :
    p.$status === 'failed' ? '#ef444422' :
    p.$status === 'processing' ? '#7c3aed22' :
    '#71717a22'};
  color: ${p =>
    p.$status === 'done' ? '#16a34a' :
    p.$status === 'failed' ? '#ef4444' :
    p.$status === 'processing' ? '#a78bfa' :
    '#71717a'};
`;

const CellMeta = styled.div`
  padding: 0.3rem 0.5rem;
  display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
`;

const TimeBadge = styled.span`
  font-size: 0.64rem; color: ${p => p.theme.colors.textMuted}; margin-left: auto;
`;

const RatedDot = styled.span`
  font-size: 0.65rem; color: #a78bfa; font-weight: 700;
`;

// ─── Viewer modal ─────────────────────────────────────────────────────────────

const ModalBackdrop = styled.div`
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.88);
  display: flex; align-items: stretch;
`;

const ModalLeft = styled.div`
  flex: 1; display: flex; flex-direction: column;
  min-width: 0;
`;

const ModelArea = styled.div`
  flex: 1; position: relative; background: #07060f;
`;

const ModelNav = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.6rem 1rem;
  background: #12111e; border-top: 1px solid #2a2740;
`;

const NavBtn = styled.button<{ $disabled?: boolean }>`
  font: inherit; font-size: 0.85rem; font-weight: 700;
  padding: 0.4rem 1rem; border-radius: 8px; cursor: ${p => p.$disabled ? 'default' : 'pointer'};
  border: 1px solid ${p => p.$disabled ? '#2a2740' : '#7c3aed'};
  background: ${p => p.$disabled ? 'transparent' : '#7c3aed22'};
  color: ${p => p.$disabled ? '#444' : '#a78bfa'};
  &:hover:not(:disabled) { background: #7c3aed44; }
`;

const NavInfo = styled.div`
  font-size: 0.8rem; color: #888; text-align: center;
`;

const NavTitle = styled.div`
  font-size: 0.95rem; font-weight: 700; color: #fff; text-align: center;
`;

const NavSub = styled.div`
  font-size: 0.72rem; color: #7c3aed; text-align: center;
`;

const ModelStatus = styled.div`
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #555; font-size: 0.9rem; pointer-events: none;
`;

const ModalRight = styled.div`
  width: 320px; flex-shrink: 0;
  display: flex; flex-direction: column;
  background: #0e0d1a; border-left: 1px solid #2a2740;
  overflow-y: auto;
`;

const PanelHeader = styled.div`
  padding: 1rem 1.2rem 0.75rem;
  border-bottom: 1px solid #2a2740;
  display: flex; align-items: center; justify-content: space-between;
`;

const PanelTitle = styled.div`
  font-size: 0.85rem; font-weight: 800; color: #e0e0e0;
`;

const CloseBtn = styled.button`
  font: inherit; font-size: 1.1rem; background: none; border: none;
  color: #555; cursor: pointer; padding: 0 4px; line-height: 1;
  &:hover { color: #e0e0e0; }
`;

const RatingPanel = styled.div`
  padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.75rem; flex: 1;
`;

const DimRow = styled.div`
  display: flex; flex-direction: column; gap: 4px;
`;

const DimLabel = styled.div`
  font-size: 0.7rem; font-weight: 700; color: #aaa; letter-spacing: 0.03em;
`;

const StarRow = styled.div` display: flex; gap: 2px; `;

const Star = styled.button<{ $on: boolean }>`
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 1.1rem; line-height: 1;
  color: ${p => p.$on ? '#f59e0b' : '#2a2740'};
  transition: color 0.1s;
  &:hover { color: #f59e0b; }
`;

const NotesArea = styled.textarea`
  font: inherit; font-size: 0.75rem;
  padding: 0.4rem 0.6rem; border-radius: 6px; resize: vertical; min-height: 64px;
  border: 1px solid #2a2740;
  background: #12111e; color: #e0e0e0;
  &:focus { outline: none; border-color: #7c3aed; }
`;

const SaveRatingBtn = styled.button`
  font: inherit; font-size: 0.8rem; font-weight: 700;
  padding: 0.5rem; border-radius: 8px; cursor: pointer;
  border: 1px solid #7c3aed;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const SubjectThumb = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 4/3;
  background: #12111e;
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: cover; background-position: center;` : ''}
  border-bottom: 1px solid #2a2740;
`;

// ─── Viewer modal component ───────────────────────────────────────────────────

interface ViewerModalProps {
  items: BenchmarkRunItem[];
  startIndex: number;
  dimensions: RatingDimension[];
  email: string;
  onClose: () => void;
  onSaved: (id: string, ratings: Record<string, number>, notes: string) => void;
}

const ViewerModal: React.FC<ViewerModalProps> = ({ items, startIndex, dimensions, email, onClose, onSaved }) => {
  const [idx, setIdx] = useState(startIndex);
  const [viewMode, setViewMode] = useState<ViewMode>('clay');
  const item = items[idx];

  const allKeys = ['overall', ...dimensions.map(d => d.key)];
  const initDraft = (it: BenchmarkRunItem) => {
    const r: Record<string, number> = {};
    allKeys.forEach(k => { r[k] = it.ratings?.[k] ?? 0; });
    return r;
  };

  const [draft, setDraft] = useState<Record<string, number>>(() => initDraft(item));
  const [notes, setNotes] = useState(item.ratingNotes || '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [bgIssue, setBgIssue] = useState<boolean>(!!(item.ratings as any)?.bgIssue);
  const [axisIssue, setAxisIssue] = useState<boolean>(!!(item.ratings as any)?.axisIssue);
  const [flagging, setFlagging] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // refs so async callbacks always read live values
  const bgIssueRef   = useRef(bgIssue);
  const axisIssueRef = useRef(axisIssue);
  bgIssueRef.current   = bgIssue;
  axisIssueRef.current = axisIssue;

  // Reset when item changes
  useEffect(() => {
    setDraft(initDraft(item));
    setNotes(item.ratingNotes || '');
    setSavedMsg('');
    setBgIssue(!!(item.ratings as any)?.bgIssue);
    setAxisIssue(!!(item.ratings as any)?.axisIssue);
  }, [idx]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft'  && idx > 0)               setIdx(i => i - 1);
      if (e.key === 'ArrowRight' && idx < items.length - 1) setIdx(i => i + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [idx, items.length, onClose]);

  // Core save — called automatically
  const autoSave = async (d: Record<string, number>, n: string) => {
    setSaving(true);
    try {
      const r = { ...d, ...(bgIssueRef.current ? { bgIssue: 1 } : {}), ...(axisIssueRef.current ? { axisIssue: 1 } : {}) };
      await benchmarkApi.rateItem(email, item.id, r, n);
      onSaved(item.id, r, n);
      setSavedMsg('✓');
      setTimeout(() => setSavedMsg(''), 1500);
    } finally { setSaving(false); }
  };

  // Star click → instant save
  const setScore = (key: string, val: number) => {
    const newDraft = { ...draft, [key]: val };
    setDraft(newDraft);
    autoSave(newDraft, notes);
  };

  // Notes → debounced save
  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => autoSave(draft, val), 900);
  };

  // Flag toggles
  const toggleBgIssue = async () => {
    const next = !bgIssue;
    setBgIssue(next);
    bgIssueRef.current = next;
    setFlagging(true);
    try {
      const r = { ...(item.ratings ?? {}), ...draft, ...(next ? { bgIssue: 1 } : { bgIssue: 0 }), ...(axisIssueRef.current ? { axisIssue: 1 } : {}) };
      await benchmarkApi.rateItem(email, item.id, r, notes);
      onSaved(item.id, r, notes);
    } finally { setFlagging(false); }
  };

  const toggleAxisIssue = async () => {
    const next = !axisIssue;
    setAxisIssue(next);
    axisIssueRef.current = next;
    setFlagging(true);
    try {
      const r = { ...(item.ratings ?? {}), ...draft, ...(bgIssueRef.current ? { bgIssue: 1 } : {}), ...(next ? { axisIssue: 1 } : { axisIssue: 0 }) };
      await benchmarkApi.rateItem(email, item.id, r, notes);
      onSaved(item.id, r, notes);
    } finally { setFlagging(false); }
  };

  const durationSec = item.jobStartedAt && item.jobCompletedAt
    ? Math.round((new Date(item.jobCompletedAt).getTime() - new Date(item.jobStartedAt).getTime()) / 1000)
    : null;
  const durationLabel = durationSec != null
    ? durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`
    : null;

  const resultUrl = toProxiedUrl(item.jobResultUrl);
  const isDone = item.jobStatus === 'done';

  return (
    <ModalBackdrop onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalLeft>
        <ModelArea>
          {resultUrl && isDone
            ? (
              <Suspense fallback={<ModelStatus>Loading 3D viewer…</ModelStatus>}>
                <MeshViewer url={resultUrl} showGrid={viewMode !== 'wireframe'} viewMode={viewMode} />
              </Suspense>
            )
            : (
              <ModelStatus>
                {item.jobStatus === 'processing' ? '⏳ Generating…' :
                 item.jobStatus === 'failed' ? '✗ Job failed' :
                 item.jobStatus === 'pending' ? '⏳ Pending…' :
                 '3D model not available'}
              </ModelStatus>
            )
          }

          {/* View-mode buttons — top-right */}
          {resultUrl && isDone && (
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 10 }}>
              {([
                { mode: 'clay',      label: '◑ Clay',      active: '#e0e0e0', bg: '#3a3a5c' },
                { mode: 'wireframe', label: '◈ Wire',       active: '#00d2ff', bg: '#003a44' },
                { mode: 'solid',     label: '◉ Solid',     active: '#a78bfa', bg: '#2a1a5c' },
              ] as const).map(({ mode, label, active, bg }) => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{
                  font: 'inherit', fontSize: '0.75rem', fontWeight: 700,
                  padding: '5px 12px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${viewMode === mode ? active : '#2a2740'}`,
                  background: viewMode === mode ? bg : 'rgba(7,6,15,0.7)',
                  color: viewMode === mode ? active : '#555',
                  transition: 'all 0.15s', backdropFilter: 'blur(4px)',
                }}>{label}</button>
              ))}
            </div>
          )}

          {/* ── PARAMS OVERLAY — left side of the viewport ── */}
          <div style={{
            position: 'absolute', top: 12, left: 12, zIndex: 10,
            background: 'rgba(4,3,12,0.90)', backdropFilter: 'blur(10px)',
            border: '1px solid #3a3560', borderRadius: 14,
            padding: '14px 18px', width: 220,
          }}>
            {/* subject name */}
            <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', marginBottom: 10, lineHeight: 1.2 }}>
              {item.subjectName}
            </div>

            {/* model + preset — big */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#555', letterSpacing: '0.07em', marginBottom: 2 }}>MODEL</div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#a78bfa' }}>{item.model}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#555', letterSpacing: '0.07em', marginBottom: 2 }}>PRESET</div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#a78bfa' }}>{item.preset}</div>
              </div>
            </div>

            {/* divider */}
            <div style={{ borderTop: '1px solid #2a2740', marginBottom: 12 }} />

            {/* all numeric params */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
              {[
                { label: 'OCTREE',    value: item.octree },
                { label: 'STEPS',     value: item.steps },
                { label: 'GUIDANCE',  value: item.guidance },
                { label: 'FACES',     value: item.faces?.toLocaleString() ?? '—' },
                { label: 'CHUNKS',    value: item.chunks },
                { label: 'SEED',      value: item.seed === 0 ? 'random' : item.seed },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 800, color: '#555', letterSpacing: '0.07em', marginBottom: 1 }}>{label}</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#e0e0e0', lineHeight: 1.1 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* divider */}
            <div style={{ borderTop: '1px solid #2a2740', margin: '12px 0 8px' }} />

            {/* timing + position + save status */}
            {durationLabel && (
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#7c3aed', marginBottom: 4 }}>⏱ {durationLabel}</div>
            )}
            <div style={{ fontSize: '0.65rem', color: '#444' }}>{idx + 1} / {items.length}</div>
            {(saving || savedMsg) && (
              <div style={{ marginTop: 4, fontSize: '0.7rem', fontWeight: 700, color: saving ? '#7c3aed' : '#22c55e' }}>
                {saving ? 'saving…' : savedMsg}
              </div>
            )}
          </div>
        </ModelArea>

        <ModelNav>
          <NavBtn $disabled={idx === 0} onClick={() => idx > 0 && setIdx(i => i - 1)}>← Prev</NavBtn>
          <NavBtn $disabled={idx === items.length - 1} onClick={() => idx < items.length - 1 && setIdx(i => i + 1)}>Next →</NavBtn>
        </ModelNav>
      </ModalLeft>

      <ModalRight>
        <PanelHeader>
          <PanelTitle>{item.subjectName}</PanelTitle>
          <CloseBtn onClick={onClose} title="Close (Esc)">✕</CloseBtn>
        </PanelHeader>

        <SubjectThumb $url={toProxiedUrl(item.subjectImageUrl)} />

        {/* Issue flags */}
        <div style={{ padding: '0.5rem 0.8rem', borderBottom: '1px solid #2a2740', display: 'flex', gap: '0.4rem' }}>
          <button onClick={toggleBgIssue} disabled={flagging} style={{
            flex: 1, font: 'inherit', fontSize: '0.75rem', fontWeight: 700,
            padding: '0.4rem 0.3rem', borderRadius: 7, cursor: 'pointer',
            border: `2px solid ${bgIssue ? '#ef4444' : '#2a2740'}`,
            background: bgIssue ? '#ef444422' : 'transparent',
            color: bgIssue ? '#ef4444' : '#555', transition: 'all 0.15s',
          }}>{bgIssue ? '🚩 BG' : '🏳 BG'}</button>
          <button onClick={toggleAxisIssue} disabled={flagging} style={{
            flex: 1, font: 'inherit', fontSize: '0.75rem', fontWeight: 700,
            padding: '0.4rem 0.3rem', borderRadius: 7, cursor: 'pointer',
            border: `2px solid ${axisIssue ? '#f59e0b' : '#2a2740'}`,
            background: axisIssue ? '#f59e0b22' : 'transparent',
            color: axisIssue ? '#f59e0b' : '#555', transition: 'all 0.15s',
          }}>{axisIssue ? '🔄 Axis' : '↕ Axis'}</button>
        </div>

        {isDone ? (
          <RatingPanel>
            <DimRow>
              <DimLabel>OVERALL</DimLabel>
              <StarRow>
                {Array.from({ length: 10 }, (_, i) => (
                  <Star key={i} $on={(draft['overall'] ?? 0) > i} onClick={() => setScore('overall', i + 1)}>
                    {(draft['overall'] ?? 0) > i ? '★' : '☆'}
                  </Star>
                ))}
                <span style={{ marginLeft: 4, fontSize: '0.85rem', color: '#f59e0b', fontWeight: 700 }}>
                  {draft['overall'] || ''}
                </span>
              </StarRow>
            </DimRow>

            {dimensions.map(dim => (
              <DimRow key={dim.key}>
                <Tooltip text={dim.description} placement="left" multiline maxWidth={220}>
                  <DimLabel>{dim.label.toUpperCase()}</DimLabel>
                </Tooltip>
                <StarRow>
                  {Array.from({ length: 10 }, (_, i) => (
                    <Star key={i} $on={(draft[dim.key] ?? 0) > i} onClick={() => setScore(dim.key, i + 1)}>
                      {(draft[dim.key] ?? 0) > i ? '★' : '☆'}
                    </Star>
                  ))}
                  <span style={{ marginLeft: 4, fontSize: '0.8rem', color: '#a78bfa', fontWeight: 700 }}>
                    {draft[dim.key] || ''}
                  </span>
                </StarRow>
              </DimRow>
            ))}

            <NotesArea
              placeholder="Notes — auto-saved…"
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
            />

          </RatingPanel>
        ) : (
          <RatingPanel>
            <div style={{ color: '#555', fontSize: '0.8rem' }}>Rating available once the job is done.</div>
          </RatingPanel>
        )}
      </ModalRight>
    </ModalBackdrop>
  );
};

// ─── Compact cell card in the grid ───────────────────────────────────────────

interface GridCellProps {
  item: BenchmarkRunItem;
  onClick: () => void;
}

const GridCell: React.FC<GridCellProps> = ({ item, onClick }) => {
  const isDone = item.jobStatus === 'done';
  const hasResult = isDone && !!item.jobResultUrl;

  const durationSec = item.jobStartedAt && item.jobCompletedAt
    ? Math.round((new Date(item.jobCompletedAt).getTime() - new Date(item.jobStartedAt).getTime()) / 1000)
    : null;
  const durationLabel = durationSec != null
    ? durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`
    : null;

  return (
    <CellCard $rated={!!item.ratings} $clickable={hasResult} onClick={hasResult ? onClick : undefined}>
      <CellThumb $url={toProxiedUrl(item.subjectImageUrl)}>
        {!item.subjectImageUrl && (isDone ? '✓' : '⏳')}
        {hasResult && (
          <ViewHint>
            <span style={{ fontSize: '1.5rem' }}>🔲</span>
            <span>View 3D &amp; Rate</span>
          </ViewHint>
        )}
      </CellThumb>
      <CellMeta>
        <StatusBadge $status={item.jobStatus}>{item.jobStatus || 'pending'}</StatusBadge>
        {(item.ratings as any)?.bgIssue ? <span style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }}>🚩 BG</span> : null}
        {(item.ratings as any)?.axisIssue ? <span style={{ fontSize: '0.65rem', color: '#f59e0b', fontWeight: 700 }}>🔄 Axis</span> : null}
        {item.ratings && <RatedDot>★</RatedDot>}
        {durationLabel && <TimeBadge>{durationLabel}</TimeBadge>}
      </CellMeta>
    </CellCard>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const BenchmarkRunResults: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const email = user?.email || '';

  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [items, setItems] = useState<BenchmarkRunItem[]>([]);
  const [dimensions, setDimensions] = useState<RatingDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [runData, itemsData, dims] = await Promise.all([
      benchmarkApi.getRun(id),
      benchmarkApi.getRunItems(id),
      benchmarkApi.getDimensions(),
    ]);
    setRun(runData);
    setItems(itemsData);
    setDimensions(dims);
    setLoading(false);
    return itemsData;
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const poll = async () => {
      const latest = await load();
      const anyPending = latest?.some(i => !i.jobStatus || i.jobStatus === 'pending' || i.jobStatus === 'processing');
      if (anyPending) pollRef.current = setTimeout(poll, 8000);
    };
    pollRef.current = setTimeout(poll, 8000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [load]);

  const onSaved = (itemId: string, ratings: Record<string, number>, notes: string) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ratings, ratingNotes: notes, ratedAt: new Date().toISOString() } : i));
  };

  // Items that have a result — for modal navigation (only cycle through viewable ones)
  const viewableItems = items.filter(i => i.jobStatus === 'done' && i.jobResultUrl);

  if (loading) return <Page><div style={{ color: '#71717a' }}>Loading…</div></Page>;
  if (!run) return <Page><div style={{ color: '#71717a' }}>Run not found.</div></Page>;

  const combos = [...new Map(items.map(i => [`${i.model}|${i.preset}`, { model: i.model, preset: i.preset }])).values()];
  const subjectIds = [...new Set(items.map(i => i.subjectId))];

  const total = items.length;
  const done = items.filter(i => i.jobStatus === 'done').length;
  const rated = items.filter(i => i.ratings !== null).length;

  return (
    <Page>
      {modalIdx !== null && viewableItems.length > 0 && (
        <ViewerModal
          items={viewableItems}
          startIndex={modalIdx}
          dimensions={dimensions}
          email={email}
          onClose={() => setModalIdx(null)}
          onSaved={onSaved}
        />
      )}

      <TopBar>
        <PageTitle>{run.name}</PageTitle>
        <RunMeta>{new Date(run.createdAt).toLocaleDateString()}</RunMeta>
        <Btn as="a" href={benchmarkApi.exportRun(run.id)} download>⬇ Export JSON</Btn>
      </TopBar>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#71717a' }}>
        <span>Jobs: <strong style={{ color: '#a78bfa' }}>{done}/{total}</strong> done</span>
        <span>Rated: <strong style={{ color: '#a78bfa' }}>{rated}/{total}</strong></span>
        {viewableItems.length > 0 && (
          <span
            style={{ color: '#a78bfa', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setModalIdx(0)}
          >
            ▶ Start reviewing ({viewableItems.length} ready)
          </span>
        )}
        {run.completedAt && <span>Completed {new Date(run.completedAt).toLocaleString()}</span>}
      </div>

      <ProgressBar $pct={total > 0 ? Math.round((done / total) * 100) : 0} />

      <GridWrap>
        <GridTable>
          <thead>
            <tr>
              <ColHeader style={{ textAlign: 'left', position: 'sticky', left: 0, zIndex: 3, background: 'inherit' }}>
                Subject
              </ColHeader>
              {combos.map(c => (
                <ColHeader key={`${c.model}|${c.preset}`}>
                  {c.model}<br />
                  <span style={{ fontWeight: 400 }}>{c.preset}</span>
                </ColHeader>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjectIds.map(subjectId => {
              const subjectItems = items.filter(i => i.subjectId === subjectId);
              const first = subjectItems[0];
              return (
                <tr key={subjectId}>
                  <RowHeader>
                    {first?.subjectImageUrl && (
                      <div style={{
                        width: 48, height: 48, borderRadius: 6, overflow: 'hidden',
                        backgroundImage: `url(${toProxiedUrl(first.subjectImageUrl)})`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        marginBottom: 6,
                      }} />
                    )}
                    <div>{first?.subjectName}</div>
                    <RowSubLabel>{first?.subjectCategoryId}</RowSubLabel>
                  </RowHeader>
                  {combos.map(c => {
                    const item = subjectItems.find(i => i.model === c.model && i.preset === c.preset);
                    if (!item) return <Cell key={`${c.model}|${c.preset}`} />;
                    const vIdx = viewableItems.findIndex(v => v.id === item.id);
                    return (
                      <Cell key={`${c.model}|${c.preset}`}>
                        <GridCell
                          item={item}
                          onClick={() => vIdx >= 0 && setModalIdx(vIdx)}
                        />
                      </Cell>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </GridTable>
      </GridWrap>
    </Page>
  );
};
