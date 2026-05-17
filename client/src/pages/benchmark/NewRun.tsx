import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MESH_TYPE_PRESETS } from '../../components/AdvancedParamsModal';
import { benchmarkApi, BenchmarkSubject, BenchmarkCategory } from './api';

// ─── Styled ───────────────────────────────────────────────────────────────────

const Page = styled.div`
  display: flex; flex-direction: column; gap: 1.75rem;
  padding: 2rem; max-width: 960px; margin: 0 auto;
`;

const PageTitle = styled.h1`
  font-size: 1.3rem; font-weight: 800; margin: 0;
  color: ${p => p.theme.colors.text};
`;

const Section = styled.div`
  display: flex; flex-direction: column; gap: 0.75rem;
`;

const SectionTitle = styled.h2`
  font-size: 0.8rem; font-weight: 700; margin: 0;
  text-transform: uppercase; letter-spacing: 0.07em;
  color: ${p => p.theme.colors.textMuted};
`;

const Btn = styled.button<{ $primary?: boolean }>`
  font: inherit; font-size: 0.82rem; font-weight: 600;
  padding: 0.55rem 1.25rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p => p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.theme.colors.text};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

const RunNameInput = styled.input`
  font: inherit; font-size: 1rem; font-weight: 600;
  padding: 0.6rem 0.85rem; border-radius: 10px; width: 100%;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const FilterBar = styled.div`
  display: flex; gap: 0.4rem; flex-wrap: wrap;
`;

const FilterChip = styled.button<{ $active?: boolean }>`
  font: inherit; font-size: 0.73rem; font-weight: 600;
  padding: 0.25rem 0.7rem; border-radius: 999px; cursor: pointer;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active ? `${p.theme.colors.violet}22` : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.violet : p.theme.colors.textMuted};
  &:hover { border-color: ${p => p.theme.colors.violet}; }
`;

const SubjectGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.6rem;
`;

const SubjectCard = styled.button<{ $selected?: boolean }>`
  display: flex; flex-direction: column; align-items: flex-start; gap: 0;
  border-radius: 10px; overflow: hidden; cursor: pointer; padding: 0;
  border: 2px solid ${p => p.$selected ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  text-align: left; font: inherit;
  transition: border-color 0.12s;
  &:hover { border-color: ${p => p.$selected ? p.theme.colors.violet : p.theme.colors.borderHigh}; }
`;

const SubjectThumb = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 1;
  background: ${p => p.theme.colors.surfaceHigh};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: cover; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; color: ${p => p.theme.colors.textMuted};
  position: relative;
`;

const SelectedBadge = styled.div`
  position: absolute; top: 5px; right: 5px;
  width: 20px; height: 20px; border-radius: 50%;
  background: ${p => p.theme.colors.violet};
  color: white; font-size: 0.7rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
`;

const SubjectLabel = styled.div`
  padding: 0.4rem 0.5rem;
  font-size: 0.72rem; font-weight: 600; color: ${p => p.theme.colors.text};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;
`;

const ComboGrid = styled.div`
  display: flex; flex-direction: column; gap: 0.5rem;
`;

const ComboRow = styled.div`
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-radius: 10px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
`;

const ComboCheck = styled.input`
  width: 16px; height: 16px; accent-color: ${p => p.theme.colors.violet}; cursor: pointer;
`;

const ComboLabel = styled.span`
  font-size: 0.84rem; font-weight: 600; color: ${p => p.theme.colors.text}; flex: 1;
`;

const ComboHint = styled.span`
  font-size: 0.7rem; color: ${p => p.theme.colors.textMuted};
`;

const SummaryBox = styled.div`
  padding: 1rem 1.25rem;
  border-radius: 12px;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => p.theme.colors.surfaceHigh};
  display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;
`;

const SumStat = styled.div`
  display: flex; flex-direction: column; gap: 2px;
`;

const SumValue = styled.div`
  font-size: 1.5rem; font-weight: 800; color: ${p => p.theme.colors.violet};
`;

const SumLabel = styled.div`
  font-size: 0.7rem; color: ${p => p.theme.colors.textMuted};
`;

const Actions = styled.div`
  display: flex; gap: 0.75rem; align-items: center;
`;

// ─── Models ───────────────────────────────────────────────────────────────────

interface ModelCombo {
  id: string;
  model: string;
  preset: string;
  label: string;
  hint: string;
  octree: number; steps: number; guidance: number; faces: number; chunks: number;
}

const MODEL_COMBOS: ModelCombo[] = [
  ...MESH_TYPE_PRESETS.map(p => ({
    id: `hunyuan3d-${p.id}`,
    model: 'hunyuan3d', preset: p.id,
    label: `Hunyuan3D-2 · ${p.label}`,
    hint: `~${p.hint} · i7-1080`,
    octree: p.octree, steps: p.steps, guidance: p.guidance, faces: p.faces, chunks: p.chunks,
  })),
  ...MESH_TYPE_PRESETS.map(p => ({
    id: `hunyuan3d-2-1-${p.id}`,
    model: 'hunyuan3d-2-1', preset: p.id,
    label: `Hunyuan3D-2.1 · ${p.label}`,
    hint: `PBR · 3090`,
    octree: p.octree, steps: p.steps, guidance: p.guidance, faces: p.faces, chunks: p.chunks,
  })),
  { id: 'triposr-draft', model: 'triposr', preset: 'draft', label: 'TripoSR', hint: 'fast · 3090', octree: 256, steps: 5, guidance: 5, faces: 30000, chunks: 8000 },
  { id: 'sf3d-draft', model: 'sf3d', preset: 'draft', label: 'Stable Fast 3D', hint: 'fast · 3090', octree: 256, steps: 5, guidance: 5, faces: 30000, chunks: 8000 },
  { id: 'hi3dgen-prop', model: 'hi3dgen', preset: 'prop', label: 'Hi3DGen', hint: 'high detail · 3090', octree: 384, steps: 10, guidance: 6, faces: 100000, chunks: 4000 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const BenchmarkNewRun: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const email = user?.email || '';

  const [runName, setRunName] = useState(`Benchmark ${new Date().toLocaleDateString()}`);
  const [subjects, setSubjects] = useState<BenchmarkSubject[]>([]);
  const [categories, setCategories] = useState<BenchmarkCategory[]>([]);
  const [filterCat, setFilterCat] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [selectedCombos, setSelectedCombos] = useState<Set<string>>(new Set(['hunyuan3d-prop']));
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([benchmarkApi.getSubjects(), benchmarkApi.getCategories()])
      .then(([subs, cats]) => {
        setSubjects(subs);
        const flat: BenchmarkCategory[] = [];
        const flatten = (nodes: BenchmarkCategory[]) =>
          nodes.forEach(n => { flat.push(n); if (n.children) flatten(n.children); });
        flatten(cats);
        setCategories(flat);
      })
      .finally(() => setLoading(false));
  }, []);

  const topCats = categories.filter(c => !c.parentId);

  const filteredSubjects = filterCat
    ? subjects.filter(s => {
        const cat = categories.find(c => c.id === s.categoryId);
        return s.categoryId === filterCat || cat?.parentId === filterCat;
      })
    : subjects;

  const toggleSubject = (id: string) => {
    setSelectedSubjects(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCombo = (id: string) => {
    setSelectedCombos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedSubjects(prev => {
      const next = new Set(prev);
      filteredSubjects.forEach(s => next.add(s.id));
      return next;
    });
  };

  const totalJobs = selectedSubjects.size * selectedCombos.size;

  const handleSubmit = async () => {
    if (!runName.trim() || totalJobs === 0) return;
    setSubmitting(true);
    try {
      const combos = MODEL_COMBOS.filter(c => selectedCombos.has(c.id));
      const items = [...selectedSubjects].flatMap(subjectId =>
        combos.map(c => ({
          subjectId, model: c.model, preset: c.preset,
          octree: c.octree, steps: c.steps, guidance: c.guidance,
          faces: c.faces, chunks: c.chunks, seed: 0,
        }))
      );
      const run = await benchmarkApi.createRun({ email, name: runName.trim(), items });
      navigate(`/benchmark/runs/${run.id}`);
    } catch (e: any) {
      alert('Failed to create run: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <PageTitle>New benchmark run</PageTitle>
      </div>

      <Section>
        <SectionTitle>Run name</SectionTitle>
        <RunNameInput
          value={runName}
          onChange={e => setRunName(e.target.value)}
          placeholder="e.g. Hard Surface comparison — May 2026"
        />
      </Section>

      <Section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <SectionTitle style={{ flex: 1 }}>
            Subjects ({selectedSubjects.size} selected)
          </SectionTitle>
          <Btn onClick={selectAllVisible} style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}>
            Select all visible
          </Btn>
          {selectedSubjects.size > 0 && (
            <Btn onClick={() => setSelectedSubjects(new Set())} style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}>
              Clear
            </Btn>
          )}
        </div>

        <FilterBar>
          <FilterChip $active={!filterCat} onClick={() => setFilterCat('')}>All</FilterChip>
          {topCats.map(c => (
            <FilterChip key={c.id} $active={filterCat === c.id} onClick={() => setFilterCat(filterCat === c.id ? '' : c.id)}>
              {c.name}
            </FilterChip>
          ))}
        </FilterBar>

        {loading ? (
          <div style={{ color: '#71717a', fontSize: '0.85rem' }}>Loading subjects…</div>
        ) : filteredSubjects.length === 0 ? (
          <div style={{ color: '#71717a', fontSize: '0.85rem' }}>No subjects yet — go to Subject Library first.</div>
        ) : (
          <SubjectGrid>
            {filteredSubjects.map(s => (
              <SubjectCard
                key={s.id}
                $selected={selectedSubjects.has(s.id)}
                onClick={() => toggleSubject(s.id)}
              >
                <SubjectThumb $url={s.imageUrl || undefined}>
                  {!s.imageUrl && '📷'}
                  {selectedSubjects.has(s.id) && <SelectedBadge>✓</SelectedBadge>}
                </SubjectThumb>
                <SubjectLabel title={s.name}>{s.name}</SubjectLabel>
              </SubjectCard>
            ))}
          </SubjectGrid>
        )}
      </Section>

      <Section>
        <SectionTitle>Model + preset combinations</SectionTitle>
        <ComboGrid>
          {MODEL_COMBOS.map(c => (
            <ComboRow key={c.id}>
              <ComboCheck
                type="checkbox"
                checked={selectedCombos.has(c.id)}
                onChange={() => toggleCombo(c.id)}
                id={`combo-${c.id}`}
              />
              <ComboLabel as="label" htmlFor={`combo-${c.id}`} style={{ cursor: 'pointer' }}>
                {c.label}
              </ComboLabel>
              <ComboHint>{c.hint}</ComboHint>
              <ComboHint style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                oct:{c.octree} · st:{c.steps} · g:{c.guidance}
              </ComboHint>
            </ComboRow>
          ))}
        </ComboGrid>
      </Section>

      <SummaryBox>
        <SumStat>
          <SumValue>{selectedSubjects.size}</SumValue>
          <SumLabel>subjects</SumLabel>
        </SumStat>
        <SumStat>
          <SumValue>×{selectedCombos.size}</SumValue>
          <SumLabel>combinations</SumLabel>
        </SumStat>
        <SumStat>
          <SumValue>{totalJobs}</SumValue>
          <SumLabel>total jobs</SumLabel>
        </SumStat>
        <div style={{ flex: 1 }} />
        <Actions>
          <Btn onClick={() => navigate('/benchmark')}>Cancel</Btn>
          <Btn $primary onClick={handleSubmit} disabled={submitting || totalJobs === 0 || !runName.trim()}>
            {submitting ? 'Submitting…' : `Submit ${totalJobs} job${totalJobs !== 1 ? 's' : ''}`}
          </Btn>
        </Actions>
      </SummaryBox>
    </Page>
  );
};
