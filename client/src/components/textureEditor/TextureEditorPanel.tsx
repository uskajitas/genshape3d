import React, { useState } from 'react';
import styled from 'styled-components';

type EditorMode = 'view' | 'select' | 'paint';

interface TextureEditorPanelProps {
  visible: boolean;
  sourceName: string;
}

const Panel = styled.section<{ $visible: boolean }>`
  position: absolute;
  left: 1rem;
  right: 1rem;
  bottom: 1rem;
  z-index: 6;
  display: ${p => p.$visible ? 'grid' : 'none'};
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 12px;
  background: ${p => p.theme.colors.surface}f2;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const Main = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  @media (max-width: 980px) {
    flex-wrap: wrap;
  }
`;

const TitleBlock = styled.div`
  min-width: 130px;
`;

const Title = styled.div`
  font-size: 0.76rem;
  font-weight: 800;
  color: ${p => p.theme.colors.text};
`;

const Subtitle = styled.div`
  margin-top: 0.12rem;
  font-size: 0.68rem;
  color: ${p => p.theme.colors.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Segmented = styled.div`
  display: inline-flex;
  padding: 0.18rem;
  border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background};
`;

const Segment = styled.button<{ $active?: boolean }>`
  min-width: 54px;
  border: 0;
  border-radius: 6px;
  padding: 0.34rem 0.55rem;
  background: ${p => p.$active ? `${p.theme.colors.violet}33` : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  font: inherit;
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;

  @media (max-width: 980px) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
`;

const SliderField = styled.label`
  display: grid;
  grid-template-columns: 64px minmax(90px, 1fr);
  align-items: center;
  gap: 0.45rem;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.68rem;
  font-weight: 700;
`;

const Range = styled.input`
  width: 100%;
  accent-color: ${p => p.theme.colors.violet};
`;

const Actions = styled.div`
  display: flex;
  gap: 0.45rem;
  justify-content: flex-end;
`;

const Action = styled.button<{ $primary?: boolean }>`
  border: 1px solid ${p => p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  border-radius: 8px;
  background: ${p => p.$primary ? `${p.theme.colors.violet}2e` : p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.45rem 0.65rem;
  cursor: pointer;
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const TextureEditorPanel: React.FC<TextureEditorPanelProps> = ({ visible, sourceName }) => {
  const [mode, setMode] = useState<EditorMode>('view');
  const [range, setRange] = useState(32);
  const [boundary, setBoundary] = useState(70);
  const [feather, setFeather] = useState(12);

  return (
    <Panel $visible={visible}>
      <Main>
        <TitleBlock>
          <Title>Texture editor</Title>
          <Subtitle title={sourceName}>{sourceName || 'No source selected'}</Subtitle>
        </TitleBlock>
        <Segmented title="Choose how to interact with the model before submitting a texture job.">
          <Segment $active={mode === 'view'} onClick={() => setMode('view')}>View</Segment>
          <Segment $active={mode === 'select'} onClick={() => setMode('select')}>Select</Segment>
          <Segment $active={mode === 'paint'} onClick={() => setMode('paint')}>Paint</Segment>
        </Segmented>
        <Controls>
          <SliderField title="Expansion radius for click-to-grow selection.">
            Range
            <Range type="range" min={0} max={100} value={range} onChange={e => setRange(parseInt(e.target.value, 10) || 0)} />
          </SliderField>
          <SliderField title="Higher values stop selection at stronger seams and edges.">
            Boundary
            <Range type="range" min={0} max={100} value={boundary} onChange={e => setBoundary(parseInt(e.target.value, 10) || 0)} />
          </SliderField>
          <SliderField title="Softens the edge of a saved texture zone.">
            Feather
            <Range type="range" min={0} max={100} value={feather} onChange={e => setFeather(parseInt(e.target.value, 10) || 0)} />
          </SliderField>
        </Controls>
      </Main>
      <Actions>
        <Action title="Add the current selection to the active zone." disabled>Add</Action>
        <Action title="Remove the current selection from the active zone." disabled>Subtract</Action>
        <Action $primary title="Save this selection as a texture zone." disabled>Save zone</Action>
      </Actions>
    </Panel>
  );
};
