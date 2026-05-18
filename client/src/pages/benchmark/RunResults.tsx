import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Tooltip } from '../../components/Tooltip';
import { benchmarkApi, BenchmarkRun, BenchmarkRunItem, RatingDimension } from './api';

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

// Grid layout — rows = subjects, columns = model/preset combos
const GridWrap = styled.div`
  overflow-x: auto;
`;

const GridTable = styled.table`
  border-collapse: separate; border-spacing: 0;
  min-width: 100%;
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
  vertical-align: top; min-width: 180px;
`;

const CellCard = styled.div<{ $rated?: boolean }>`
  display: flex; flex-direction: column; gap: 0.4rem;
  border-radius: 10px; overflow: hidden;
  border: 1px solid ${p => p.$rated ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  font-size: 0.72rem;
`;

const CellThumb = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 4/3;
  background: ${p => p.theme.colors.surfaceHigh};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: cover; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  color: ${p => p.theme.colors.textMuted}; font-size: 1.5rem;
  cursor: ${p => p.$url ? 'pointer' : 'default'};
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

const ModelLink = styled.a`
  display: inline-block;
  font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 5px;
  background: #16a34a22; color: #16a34a; text-decoration: none;
  border: 1px solid #16a34a44;
  &:hover { background: #16a34a44; }
`;

const TimeBadge = styled.span`
  font-size: 0.64rem; color: ${p => p.theme.colors.textMuted};
  margin-left: auto;
`;

// Rating panel inside cell
const RateSection = styled.div`
  padding: 0.5rem; border-top: 1px solid ${p => p.theme.colors.border};
  display: flex; flex-direction: column; gap: 0.4rem;
`;

const RateDimRow = styled.div`
  display: flex; align-items: center; gap: 0.4rem;
`;

const RateDimLabel = styled.span`
  font-size: 0.64rem; color: ${p => p.theme.colors.textMuted};
  width: 56px; flex-shrink: 0;
`;

const StarRow = styled.div`
  display: flex; gap: 1px; flex: 1;
`;

const Star = styled.button<{ $on: boolean }>`
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 0.9rem; line-height: 1;
  color: ${p => p.$on ? '#f59e0b' : p.theme.colors.border};
  transition: color 0.1s;
  &:hover { color: #f59e0b; }
`;

const RateNotes = styled.textarea`
  font: inherit; font-size: 0.7rem;
  padding: 0.3rem 0.5rem; border-radius: 6px; resize: vertical; min-height: 50px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const SaveBtn = styled.button`
  font: inherit; font-size: 0.72rem; font-weight: 600;
  padding: 0.3rem 0.75rem; border-radius: 6px; cursor: pointer;
  border: 1px solid ${p => p.theme.colors.violet};
  background: ${p => p.theme.colors.violet}22;
  color: ${p => p.theme.colors.violet};
  align-self: flex-end;
  &:hover { background: ${p => p.theme.colors.violet}44; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const OverallRow = styled.div`
  display: flex; align-items: center; gap: 0.5rem;
`;

const OverallLabel = styled.span`
  font-size: 0.64rem; font-weight: 700; color: ${p => p.theme.colors.text};
  width: 56px; flex-shrink: 0;
`;

// ─── Rating cell component ────────────────────────────────────────────────────

interface RatingCellProps {
  item: BenchmarkRunItem;
  dimensions: RatingDimension[];
  onSaved: (id: string, ratings: Record<string, number>, notes: string) => void;
  email: string;
}

const RatingCell: React.FC<RatingCellProps> = ({ item, dimensions, onSaved, email }) => {
  const allKeys = ['overall', ...dimensions.map(d => d.key)];
  const initRatings = () => {
    const r: Record<string, number> = {};
    allKeys.forEach(k => { r[k] = item.ratings?.[k] ?? 0; });
    return r;
  };

  const [draft, setDraft] = useState<Record<string, number>>(initRatings);
  const [notes, setNotes] = useState(item.ratingNotes || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(initRatings()); setNotes(item.ratingNotes || ''); }, [item.id]);

  const isDone = item.jobStatus === 'done';
  const durationSec = item.jobStartedAt && item.jobCompletedAt
    ? Math.round((new Date(item.jobCompletedAt).getTime() - new Date(item.jobStartedAt).getTime()) / 1000)
    : null;
  const durationLabel = durationSec != null
    ? durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`
    : null;

  const setScore = (key: string, val: number) => setDraft(d => ({ ...d, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await benchmarkApi.rateItem(email, item.id, draft, notes);
      onSaved(item.id, draft, notes);
    } finally { setSaving(false); }
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(initRatings()) || notes !== (item.ratingNotes || '');

  return (
    <CellCard $rated={!!item.ratings}>
      {/* Show the subject input image as visual reference — jobResultUrl is a GLB, not renderable as img */}
      <CellThumb
        $url={item.subjectImageUrl || undefined}
      >
        {!item.subjectImageUrl && (isDone ? '✓' : '⏳')}
      </CellThumb>

      <CellMeta>
        <StatusBadge $status={item.jobStatus}>{item.jobStatus || 'pending'}</StatusBadge>
        {item.jobResultUrl && (
          <ModelLink href={item.jobResultUrl} target="_blank" rel="noopener">View 3D ↗</ModelLink>
        )}
        {durationLabel && <TimeBadge>⏱ {durationLabel}</TimeBadge>}
      </CellMeta>

      {isDone && (
        <RateSection>
          {/* Overall 1-10 */}
          <OverallRow>
            <Tooltip text="Overall gut feeling — is this a usable asset?" placement="left" multiline maxWidth={200}>
              <OverallLabel>Overall</OverallLabel>
            </Tooltip>
            <StarRow>
              {Array.from({ length: 10 }, (_, i) => (
                <Star key={i} $on={(draft['overall'] ?? 0) > i} onClick={() => setScore('overall', i + 1)}>
                  {(draft['overall'] ?? 0) > i ? '★' : '☆'}
                </Star>
              ))}
            </StarRow>
            <span style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 700, minWidth: 16 }}>
              {draft['overall'] || ''}
            </span>
          </OverallRow>

          {/* Per-dimension */}
          {dimensions.map(dim => (
            <RateDimRow key={dim.key}>
              <Tooltip text={dim.description} placement="left" multiline maxWidth={220}>
                <RateDimLabel>{dim.label}</RateDimLabel>
              </Tooltip>
              <StarRow>
                {Array.from({ length: 10 }, (_, i) => (
                  <Star key={i} $on={(draft[dim.key] ?? 0) > i} onClick={() => setScore(dim.key, i + 1)}>
                    {(draft[dim.key] ?? 0) > i ? '★' : '☆'}
                  </Star>
                ))}
              </StarRow>
              <span style={{ fontSize: '0.7rem', color: '#71717a', minWidth: 16 }}>
                {draft[dim.key] || ''}
              </span>
            </RateDimRow>
          ))}

          <RateNotes
            placeholder="Notes (optional)…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
          <SaveBtn onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? 'Saving…' : item.ratings ? 'Update rating' : 'Save rating'}
          </SaveBtn>
        </RateSection>
      )}
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

  useEffect(() => {
    load();
  }, [load]);

  // Poll while jobs are still running
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

  if (loading) return <Page><div style={{ color: '#71717a' }}>Loading…</div></Page>;
  if (!run) return <Page><div style={{ color: '#71717a' }}>Run not found.</div></Page>;

  // Build column headers (unique model+preset combos)
  const combos = [...new Map(items.map(i => [`${i.model}|${i.preset}`, { model: i.model, preset: i.preset }])).values()];

  // Group items by subject
  const subjectIds = [...new Set(items.map(i => i.subjectId))];

  const total = items.length;
  const done = items.filter(i => i.jobStatus === 'done').length;
  const rated = items.filter(i => i.ratings !== null).length;

  return (
    <Page>
      <TopBar>
        <PageTitle>{run.name}</PageTitle>
        <RunMeta>{new Date(run.createdAt).toLocaleDateString()}</RunMeta>
        <Btn as="a" href={benchmarkApi.exportRun(run.id)} download>⬇ Export JSON</Btn>
      </TopBar>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#71717a' }}>
        <span>Jobs: <strong style={{ color: '#a78bfa' }}>{done}/{total}</strong> done</span>
        <span>Rated: <strong style={{ color: '#a78bfa' }}>{rated}/{total}</strong></span>
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
                        backgroundImage: `url(${first.subjectImageUrl})`,
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
                    return (
                      <Cell key={`${c.model}|${c.preset}`}>
                        <RatingCell
                          item={item}
                          dimensions={dimensions}
                          onSaved={onSaved}
                          email={email}
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
