import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { useAppUser } from '../context/UserContext';

type PhaseState = 'now' | 'next' | 'later';

interface RoadmapPhase {
  number: number;
  title: string;
  effort: string;
  state: PhaseState;
  outcome: string;
  work: string[];
  risk: string;
}

interface StarterTask {
  id: string;
  label: string;
  detail: string;
}

const STARTER_TASKS: StarterTask[] = [
  { id: 'scene-document', label: 'Define the scene document', detail: 'Nodes, asset version, parent, transform, lights, cameras and environment.' },
  { id: 'scene-editor', label: 'Create a separate SceneEditor', detail: 'Keep MeshViewer as the single-asset preview; scene transforms must not auto-normalize.' },
  { id: 'multi-load', label: 'Load multiple GLB assets', detail: 'Add, remove, duplicate and select independent scene instances.' },
  { id: 'transforms', label: 'Add transform controls', detail: 'Move, rotate and scale the selected instance while preserving its source asset.' },
  { id: 'outliner', label: 'Add a basic outliner', detail: 'Show every object, light and camera in a simple selectable hierarchy.' },
  { id: 'lighting', label: 'Add presentation lighting', detail: 'Ground plane, shadows, neutral HDRI and one adjustable key light.' },
  { id: 'save-capture', label: 'Save and capture', detail: 'Persist scene JSON, restore it, and export a presentation-ready PNG.' },
];

const ROADMAP: RoadmapPhase[] = [
  {
    number: 1,
    title: 'Scene basics',
    effort: '5–8 days',
    state: 'now',
    outcome: 'Compose current GenShape3D assets into simple presentation scenes.',
    work: ['Multiple GLBs', 'Transforms', 'Outliner', 'Ground and lights', 'Save/load JSON'],
    risk: 'The current MeshViewer recenters and rescales assets, so scene composition needs a separate viewer path.',
  },
  {
    number: 2,
    title: 'Presentation output',
    effort: '3–5 days',
    state: 'next',
    outcome: 'Produce consistent stills that can be used in your other project presentations.',
    work: ['Camera presets', 'HDRI/backgrounds', 'Transparent PNG', 'High-resolution capture'],
    risk: 'Browser captures and color management must be checked at the target presentation resolution.',
  },
  {
    number: 3,
    title: 'PBR materials',
    effort: '1–2 weeks',
    state: 'next',
    outcome: 'Make assets react correctly to scene lighting.',
    work: ['Albedo', 'Roughness', 'Metallic', 'Normal and AO', 'Map inspector'],
    risk: 'Bad UVs, seams and incorrect color spaces can make valid maps look broken.',
  },
  {
    number: 4,
    title: 'Manual material zones',
    effort: '1–2 weeks',
    state: 'later',
    outcome: 'Assign different materials to selected regions of one asset.',
    work: ['Persistent zones', 'Brush add/remove', 'Connected selection', 'Material assignments'],
    risk: 'Triangle indices are invalidated by retopology, so zones must belong to an immutable asset version.',
  },
  {
    number: 5,
    title: 'Semantic segmentation',
    effort: '2–4 weeks',
    state: 'later',
    outcome: 'Automatically propose named, editable object parts.',
    work: ['Provider adapter', 'Named regions', 'Merge/split', 'Manual correction'],
    risk: 'Automatic boundaries will be imperfect and separated surfaces may need hidden-geometry completion.',
  },
  {
    number: 6,
    title: 'Basic rigging',
    effort: '2–4 weeks',
    state: 'later',
    outcome: 'Pose humanoid assets and play imported animations.',
    work: ['Rigged GLB support', 'Skeleton viewer', 'Animation playback', 'Humanoid auto-rig workflow'],
    risk: 'Generated topology often deforms poorly; arbitrary creatures should remain outside the first rigging scope.',
  },
  {
    number: 7,
    title: 'Scene editor v2',
    effort: '1–2 weeks',
    state: 'later',
    outcome: 'Turn the MVP into a reusable scene-authoring tool.',
    work: ['Parenting', 'Snapping', 'Prefabs', 'Material overrides', 'Scene export'],
    risk: 'Undo/redo and asset-version changes require deliberate state management.',
  },
];

const STORAGE_KEY = 'genshape3d-admin-scene-roadmap-v1';

const Shell = styled.main`
  min-height: 100vh;
  background:
    radial-gradient(circle at 20% 0%, ${p => p.theme.colors.primary}18, transparent 34%),
    ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
`;

const Header = styled.header`
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.8rem clamp(1rem, 3vw, 2.5rem);
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  position: sticky;
  top: 0;
  z-index: 10;
`;

const BackButton = styled.button`
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px;
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.textMuted};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.48rem 0.7rem;
  cursor: pointer;
  &:hover { color: ${p => p.theme.colors.text}; border-color: ${p => p.theme.colors.primary}; }
`;

const HeaderTitle = styled.div`
  min-width: 0;
`;

const Eyebrow = styled.div`
  color: ${p => p.theme.colors.violet};
  font-size: 0.64rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
`;

const Title = styled.h1`
  margin: 0.12rem 0 0;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
`;

const AdminBadge = styled.span`
  margin-left: auto;
  padding: 0.28rem 0.58rem;
  border: 1px solid ${p => p.theme.colors.violet}66;
  border-radius: 999px;
  background: ${p => p.theme.colors.violet}18;
  color: ${p => p.theme.colors.violet};
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const Content = styled.div`
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 3.5rem;
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.6fr);
  gap: 1rem;
  margin-bottom: 1.25rem;

  @media (max-width: 800px) { grid-template-columns: 1fr; }
`;

const Surface = styled.section`
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 14px;
  background: linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
`;

const Intro = styled(Surface)`
  padding: clamp(1.2rem, 3vw, 2rem);
`;

const HeroTitle = styled.h2`
  margin: 0;
  max-width: 720px;
  font-size: clamp(1.55rem, 3.5vw, 2.5rem);
  line-height: 1.08;
  letter-spacing: -0.045em;
`;

const HeroText = styled.p`
  max-width: 720px;
  margin: 0.8rem 0 0;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.9rem;
  line-height: 1.65;
`;

const HeroActions = styled.div`
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-top: 1.2rem;
`;

const PrimaryButton = styled.button`
  border: 0;
  border-radius: 9px;
  padding: 0.65rem 0.9rem;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 24px ${p => p.theme.colors.primary}33;
`;

const ProgressCard = styled(Surface)`
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const ProgressValue = styled.div`
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: -0.05em;
`;

const Muted = styled.div`
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.76rem;
  line-height: 1.5;
`;

const ProgressTrack = styled.div`
  height: 7px;
  margin: 0.8rem 0;
  border-radius: 999px;
  overflow: hidden;
  background: ${p => p.theme.colors.surfaceHigh};
`;

const ProgressFill = styled.div<{ $value: number }>`
  width: ${p => p.$value}%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  transition: width 0.2s ease;
`;

const SectionHeading = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin: 1.6rem 0 0.75rem;
`;

const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1rem;
  letter-spacing: -0.02em;
`;

const Checklist = styled(Surface)`
  padding: 0.45rem;
`;

const TaskRow = styled.label`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
  padding: 0.8rem;
  border-radius: 9px;
  cursor: pointer;
  &:hover { background: ${p => p.theme.colors.surfaceHigh}; }
  & + & { border-top: 1px solid ${p => p.theme.colors.border}; }
`;

const TaskCheck = styled.input`
  width: 17px;
  height: 17px;
  margin-top: 0.08rem;
  accent-color: ${p => p.theme.colors.violet};
  cursor: pointer;
`;

const TaskLabel = styled.div<{ $done: boolean }>`
  color: ${p => p.$done ? p.theme.colors.textMuted : p.theme.colors.text};
  font-size: 0.82rem;
  font-weight: 800;
  text-decoration: ${p => p.$done ? 'line-through' : 'none'};
`;

const TaskDetail = styled.div`
  margin-top: 0.18rem;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.74rem;
  line-height: 1.45;
`;

const Roadmap = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(285px, 1fr));
  gap: 0.75rem;
`;

const PhaseCard = styled(Surface)<{ $state: PhaseState }>`
  padding: 1rem;
  border-color: ${p => p.$state === 'now' ? p.theme.colors.primary : p.theme.colors.border};
  box-shadow: ${p => p.$state === 'now' ? `0 12px 34px ${p.theme.colors.primary}18` : 'none'};
`;

const PhaseTop = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
`;

const PhaseNumber = styled.span<{ $state: PhaseState }>`
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: ${p => p.$state === 'now' ? p.theme.colors.primary : p.theme.colors.surfaceHigh};
  color: ${p => p.$state === 'now' ? 'white' : p.theme.colors.textMuted};
  font-size: 0.72rem;
  font-weight: 900;
`;

const PhaseName = styled.h3`
  margin: 0;
  font-size: 0.88rem;
`;

const Effort = styled.span`
  margin-left: auto;
  color: ${p => p.theme.colors.primaryLight};
  font-size: 0.7rem;
  font-weight: 800;
`;

const Outcome = styled.p`
  min-height: 2.8rem;
  margin: 0.7rem 0;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.76rem;
  line-height: 1.5;
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
`;

const Chip = styled.span`
  padding: 0.22rem 0.45rem;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 6px;
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.66rem;
  font-weight: 700;
`;

const Risk = styled.div`
  margin-top: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.7rem;
  line-height: 1.45;
`;

const ResetButton = styled.button`
  border: 0;
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  font: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  &:hover { color: ${p => p.theme.colors.violet}; }
`;

const Loading = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.82rem;
`;

const readCompleted = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const AdminRoadmap: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { appUser } = useAppUser();
  const [completed, setCompleted] = useState<string[]>(readCompleted);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
  }, [completed]);

  const progress = useMemo(
    () => Math.round((completed.length / STARTER_TASKS.length) * 100),
    [completed],
  );

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!appUser.loaded) return <Loading>Checking admin access…</Loading>;
  if (appUser.role !== 'admin') return <Navigate to="/dashboard" replace />;

  const toggleTask = (id: string) => {
    setCompleted(current => current.includes(id)
      ? current.filter(item => item !== id)
      : [...current, id]);
  };

  return (
    <Shell>
      <Header>
        <BackButton type="button" onClick={() => navigate('/dashboard')}>← Workspace</BackButton>
        <HeaderTitle>
          <Eyebrow>GenShape3D plan</Eyebrow>
          <Title>Product roadmap</Title>
        </HeaderTitle>
        <AdminBadge>Admin only</AdminBadge>
      </Header>

      <Content>
        <Hero>
          <Intro>
            <Eyebrow>Current focus · Iteration 1</Eyebrow>
            <HeroTitle>Build small scenes first. Improve every asset capability around them.</HeroTitle>
            <HeroText>
              The first milestone is intentionally narrow: compose existing GLBs, light them, save the layout and capture a presentation image. PBR maps, segmentation and rigging follow without blocking useful scene output.
            </HeroText>
            <HeroActions>
              <PrimaryButton type="button" onClick={() => navigate('/dashboard')}>Open current assets</PrimaryButton>
            </HeroActions>
          </Intro>
          <ProgressCard>
            <Eyebrow>Scene basics</Eyebrow>
            <ProgressValue>{progress}%</ProgressValue>
            <ProgressTrack><ProgressFill $value={progress} /></ProgressTrack>
            <Muted>{completed.length} of {STARTER_TASKS.length} starter tasks complete. Progress is saved in this browser.</Muted>
          </ProgressCard>
        </Hero>

        <SectionHeading>
          <div>
            <Eyebrow>Start here</Eyebrow>
            <SectionTitle>Scene MVP checklist</SectionTitle>
          </div>
          {completed.length > 0 && <ResetButton type="button" onClick={() => setCompleted([])}>Reset progress</ResetButton>}
        </SectionHeading>
        <Checklist>
          {STARTER_TASKS.map(task => {
            const done = completed.includes(task.id);
            return (
              <TaskRow key={task.id}>
                <TaskCheck type="checkbox" checked={done} onChange={() => toggleTask(task.id)} />
                <div>
                  <TaskLabel $done={done}>{task.label}</TaskLabel>
                  <TaskDetail>{task.detail}</TaskDetail>
                </div>
              </TaskRow>
            );
          })}
        </Checklist>

        <SectionHeading>
          <div>
            <Eyebrow>Path to the final goal</Eyebrow>
            <SectionTitle>Incremental roadmap</SectionTitle>
          </div>
          <Muted>Estimated full-time solo effort</Muted>
        </SectionHeading>
        <Roadmap>
          {ROADMAP.map(phase => (
            <PhaseCard key={phase.number} $state={phase.state}>
              <PhaseTop>
                <PhaseNumber $state={phase.state}>{phase.number}</PhaseNumber>
                <PhaseName>{phase.title}</PhaseName>
                <Effort>{phase.effort}</Effort>
              </PhaseTop>
              <Outcome>{phase.outcome}</Outcome>
              <Chips>{phase.work.map(item => <Chip key={item}>{item}</Chip>)}</Chips>
              <Risk><strong>Watch:</strong> {phase.risk}</Risk>
            </PhaseCard>
          ))}
        </Roadmap>
      </Content>
    </Shell>
  );
};

export default AdminRoadmap;
