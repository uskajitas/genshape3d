import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { useAppUser } from '../context/UserContext';
import planText from '../../../GENSHAPE3D_ROADMAP.md?raw';
import conversationText from '../../../GENSHAPE3D_PLAN_CONVERSATION.txt?raw';

type Speaker = 'USER' | 'CODEX';

interface ConversationTurn {
  speaker: Speaker;
  body: string;
}

const conversationTurns: ConversationTurn[] = conversationText
  .split(/^=== /m)
  .filter(Boolean)
  .map(chunk => {
    const firstLineEnd = chunk.indexOf('\n');
    const speaker = chunk.slice(0, firstLineEnd).replace(' ===', '').trim() as Speaker;
    return { speaker, body: chunk.slice(firstLineEnd + 1).trim() };
  });

const renderPlan = (text: string): React.ReactNode[] => {
  const lines = text.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith('# ')) {
      nodes.push(<PlanHeading key={index}>{line.slice(2)}</PlanHeading>);
      index += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      nodes.push(<PlanSectionHeading key={index}>{line.slice(3)}</PlanSectionHeading>);
      index += 1;
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      nodes.push(
        <PlanList key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
        </PlanList>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !lines[index].trim().startsWith('#')
      && !lines[index].trim().startsWith('- ')
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push(<PlanParagraph key={`paragraph-${index}`}>{paragraph.join(' ')}</PlanParagraph>);
  }

  return nodes;
};

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
  width: min(980px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 4rem;
`;

const SourceNote = styled.div`
  margin-bottom: 0.8rem;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.72rem;
`;

const QuickNav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 1rem;
`;

const JumpLink = styled.a`
  padding: 0.5rem 0.72rem;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px;
  background: ${p => p.theme.colors.surface};
  color: ${p => p.theme.colors.text};
  font-size: 0.76rem;
  font-weight: 700;
  text-decoration: none;
  &:hover { border-color: ${p => p.theme.colors.primary}; }
`;

const PlanDocument = styled.article`
  padding: clamp(1.15rem, 3vw, 2.25rem);
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 14px;
  background: linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
  box-shadow: 0 18px 55px ${p => p.theme.colors.background}88;
`;

const PlanHeading = styled.h2`
  margin: 0 0 0.75rem;
  font-size: clamp(1.45rem, 4vw, 2.2rem);
  letter-spacing: -0.04em;
`;

const PlanSectionHeading = styled.h3`
  margin: 2.4rem 0 0.75rem;
  padding-top: 1.4rem;
  border-top: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.theme.colors.violet};
  font-size: 1.15rem;
  letter-spacing: -0.02em;
`;

const PlanParagraph = styled.p`
  margin: 0.7rem 0;
  color: ${p => p.theme.colors.text};
  font-size: 0.88rem;
  line-height: 1.72;
`;

const PlanList = styled.ul`
  display: grid;
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
  padding-left: 1.25rem;
  color: ${p => p.theme.colors.text};
  font-size: 0.86rem;
  line-height: 1.62;
  li::marker { color: ${p => p.theme.colors.primary}; }
`;

const ConversationHeading = styled.h2`
  margin: 3rem 0 0.35rem;
  font-size: 1.35rem;
  letter-spacing: -0.03em;
`;

const Transcript = styled.article`
  display: grid;
  gap: 1rem;
  padding: clamp(1rem, 3vw, 2rem);
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 14px;
  background: linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
  box-shadow: 0 18px 55px ${p => p.theme.colors.background}88;
`;

const Turn = styled.section<{ $speaker: Speaker }>`
  width: min(88%, 780px);
  justify-self: ${p => (p.$speaker === 'USER' ? 'end' : 'start')};
`;

const SpeakerLabel = styled.div<{ $speaker: Speaker }>`
  margin: 0 0 0.32rem 0.15rem;
  color: ${p => (p.$speaker === 'USER' ? p.theme.colors.primary : p.theme.colors.violet)};
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
`;

const Message = styled.div<{ $speaker: Speaker }>`
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 1rem 1.1rem;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: ${p => (p.$speaker === 'USER' ? '14px 4px 14px 14px' : '4px 14px 14px 14px')};
  background: ${p => (p.$speaker === 'USER' ? p.theme.colors.surfaceHigh : p.theme.colors.surface)};
  color: ${p => p.theme.colors.text};
  font-size: 0.86rem;
  line-height: 1.7;
`;

const Loading = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.82rem;
`;

const AdminRoadmap: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { appUser } = useAppUser();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!appUser.loaded) return <Loading>Checking admin access…</Loading>;
  if (appUser.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return (
    <Shell>
      <Header>
        <BackButton type="button" onClick={() => navigate('/dashboard')}>← Workspace</BackButton>
        <HeaderTitle>
          <Eyebrow>GenShape3D</Eyebrow>
          <Title>Roadmap</Title>
        </HeaderTitle>
        <AdminBadge>Admin only</AdminBadge>
      </Header>
      <Content>
        <QuickNav aria-label="Roadmap navigation">
          <JumpLink href="#plan">What to do</JumpLink>
          <JumpLink href="#conversation">Original conversation</JumpLink>
        </QuickNav>
        <SourceNote id="plan">Complete plan stored in GENSHAPE3D_ROADMAP.md</SourceNote>
        <PlanDocument>{renderPlan(planText)}</PlanDocument>
        <ConversationHeading id="conversation">Original plan conversation</ConversationHeading>
        <SourceNote>Preserved in GENSHAPE3D_PLAN_CONVERSATION.txt</SourceNote>
        <Transcript aria-label="Original plan conversation">
          {conversationTurns.map((turn, index) => (
            <Turn key={`${turn.speaker}-${index}`} $speaker={turn.speaker}>
              <SpeakerLabel $speaker={turn.speaker}>{turn.speaker === 'USER' ? 'YOU' : 'CODEX'}</SpeakerLabel>
              <Message $speaker={turn.speaker}>{turn.body}</Message>
            </Turn>
          ))}
        </Transcript>
      </Content>
    </Shell>
  );
};

export default AdminRoadmap;
