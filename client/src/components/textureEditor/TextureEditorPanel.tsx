import React from 'react';
import styled from 'styled-components';
import type { MeshSelectionSummary, MeshSelectionZone } from '../../features/meshSelection';
import { Tooltip } from '../Tooltip';

type EditorMode = 'view' | 'select' | 'paint';

export interface TextureEditorSettings {
  mode: EditorMode;
  range: number;
  boundary: number;
  feather: number;
}

export interface MaterialVizSettings {
  autoRotate: boolean;
  viewMode: 'solid' | 'clay' | 'wireframe';
  showGrid: boolean;
}

interface TextureEditorPanelProps {
  visible: boolean;
  sourceName: string;
  viz: MaterialVizSettings;
  onVizChange: (viz: MaterialVizSettings) => void;
  settings: TextureEditorSettings;
  selection: MeshSelectionSummary | null;
  zones: MeshSelectionZone[];
  activeZoneId: string | null;
  onSettingsChange: (settings: TextureEditorSettings) => void;
  onAddZone: () => void;
  onSelectZone: (id: string) => void;
  onAddToZone: () => void;
  onSubtractFromZone: () => void;
  onSaveZone: () => void;
  onClearSelection: () => void;
  onDeleteZone: () => void;
}

const Panel = styled.section<{ $visible: boolean }>`
  position: absolute;
  left: 1rem;
  right: 1rem;
  bottom: 1rem;
  z-index: 6;
  display: ${p => p.$visible ? 'flex' : 'none'};
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 12px;
  background: ${p => p.theme.colors.surface}f2;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(10px);
`;

const PanelRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
  min-width: 0;
`;

const RowSpacer = styled.div`
  flex: 1;
`;

const GroupLabel = styled.span`
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: ${p => p.theme.colors.textMuted};
  margin-right: -0.25rem;
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
  min-width: 0;
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
  flex-wrap: wrap;
`;

const SliderField = styled.label`
  display: grid;
  grid-template-columns: 58px 110px;
  align-items: center;
  gap: 0.4rem;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.66rem;
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

const ZoneStrip = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  max-width: 360px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

const ZoneChip = styled.button<{ $active?: boolean; $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  max-width: 92px;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  box-shadow: inset 3px 0 0 ${p => p.$color};
  border-radius: 7px;
  background: ${p => p.$active ? `${p.theme.colors.violet}22` : p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.66rem;
  font-weight: 800;
  padding: 0.36rem 0.45rem;
  cursor: pointer;
`;

const ZoneDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${p => p.$color};
`;

const ZoneName = styled.span`
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const WorkflowHint = styled.div`
  font-size: 0.7rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.5;
  b { color: ${p => p.theme.colors.text}; }
`;

const Kbd = styled.span`
  display: inline-block;
  padding: 0 0.32rem;
  margin: 0 0.08rem;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-bottom-width: 2px;
  border-radius: 4px;
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font-size: 0.64rem;
  font-weight: 700;
`;

const SelectionMeta = styled.div`
  min-width: 74px;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.68rem;
  font-weight: 700;
  text-align: right;
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

const IconAction = styled(Action)`
  min-width: 30px;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
`;

export const TextureEditorPanel: React.FC<TextureEditorPanelProps> = ({
  visible,
  sourceName,
  viz,
  onVizChange,
  settings,
  selection,
  zones,
  activeZoneId,
  onSettingsChange,
  onAddZone,
  onSelectZone,
  onAddToZone,
  onSubtractFromZone,
  onSaveZone,
  onClearSelection,
  onDeleteZone,
}) => {
  const update = (patch: Partial<TextureEditorSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  };

  const selectionActive = settings.mode !== 'view';

  return (
    <Panel $visible={visible}>
      {/* Row 1 — what am I looking at + how */}
      <PanelRow>
        <TitleBlock>
          <Title>Material zones</Title>
          <Subtitle title={sourceName}>{sourceName || 'No source selected'}</Subtitle>
        </TitleBlock>
        <GroupLabel>Mode</GroupLabel>
        <Segmented>
          <Segment $active={settings.mode === 'view'} onClick={() => update({ mode: 'view' })}>View</Segment>
          <Segment $active={settings.mode === 'select'} onClick={() => update({ mode: 'select' })}>Select</Segment>
          <Segment $active={settings.mode === 'paint'} onClick={() => update({ mode: 'paint' })}>Paint</Segment>
        </Segmented>
        <GroupLabel>Shading</GroupLabel>
        <Segmented>
          <Segment $active={viz.viewMode === 'solid'} onClick={() => onVizChange({ ...viz, viewMode: 'solid' })}>Solid</Segment>
          <Segment $active={viz.viewMode === 'clay'} onClick={() => onVizChange({ ...viz, viewMode: 'clay' })}>Clay</Segment>
          <Segment $active={viz.viewMode === 'wireframe'} onClick={() => onVizChange({ ...viz, viewMode: 'wireframe' })}>Wire</Segment>
        </Segmented>
        <Segmented>
          <Segment $active={viz.autoRotate} onClick={() => onVizChange({ ...viz, autoRotate: !viz.autoRotate })}>Spin</Segment>
          <Segment $active={viz.showGrid} onClick={() => onVizChange({ ...viz, showGrid: !viz.showGrid })}>Grid</Segment>
        </Segmented>
        <RowSpacer />
        <SelectionMeta title={selection ? `${selection.meshName}, seed face ${selection.seedFaceIndex}` : 'Click the model in Select or Paint mode.'}>
          {selection ? `${selection.faceCount} faces` : selectionActive ? 'No selection' : ''}
        </SelectionMeta>
      </PanelRow>

      {/* Row 2 — zone workflow, only when a picking mode is active */}
      {selectionActive && (
        <PanelRow>
          <Controls>
            <Tooltip text="Expansion radius for click-to-grow selection." multiline maxWidth={230}><SliderField>
              Range
              <Range type="range" min={0} max={100} value={settings.range} onChange={e => update({ range: parseInt(e.target.value, 10) || 0 })} />
            </SliderField></Tooltip>
            <Tooltip text="Higher values stop selection at stronger seams and edges." multiline maxWidth={230}><SliderField>
              Boundary
              <Range type="range" min={0} max={100} value={settings.boundary} onChange={e => update({ boundary: parseInt(e.target.value, 10) || 0 })} />
            </SliderField></Tooltip>
            <Tooltip text="Softens the edge of a saved texture zone." multiline maxWidth={230}><SliderField>
              Feather
              <Range type="range" min={0} max={100} value={settings.feather} onChange={e => update({ feather: parseInt(e.target.value, 10) || 0 })} />
            </SliderField></Tooltip>
          </Controls>
          <ZoneStrip>
            {zones.map((zone, i) => (
              <Tooltip key={zone.id} text={`${zone.name} — ${zone.faceIndices.length} faces (key ${i + 1})`}>
                <ZoneChip
                  type="button"
                  $active={activeZoneId === zone.id}
                  $color={zone.color}
                  onClick={() => onSelectZone(zone.id)}
                >
                  <ZoneDot $color={zone.color} />
                  <ZoneName>{zone.name} · {zone.faceIndices.length}</ZoneName>
                </ZoneChip>
              </Tooltip>
            ))}
            <IconAction title="New zone (N). Becomes the active zone; Assign fills it." onClick={onAddZone}>+ Zone</IconAction>
          </ZoneStrip>
          <RowSpacer />
          {zones.length === 0 && !selection ? (
            <WorkflowHint>
              <b>How it works:</b> click the model to select (yellow) → <Kbd>A</Kbd> assign to the
              active zone · <Kbd>N</Kbd> new zone · <Kbd>1</Kbd>–<Kbd>9</Kbd> pick zone · <Kbd>X</Kbd> remove · <Kbd>Esc</Kbd> clear
            </WorkflowHint>
          ) : (
            <Actions>
              <Tooltip text="Assign the yellow selection to the active zone (A) — the selection stays so you can keep building." multiline maxWidth={240}><Action $primary disabled={!selection} onClick={onAddToZone}>Assign (A)</Action></Tooltip>
              <Tooltip text="Remove the selected faces from the active zone (X)." multiline maxWidth={220}><Action disabled={!selection || !activeZoneId} onClick={onSubtractFromZone}>Remove (X)</Action></Tooltip>
              <Tooltip text="Clear the selection (Esc)."><IconAction disabled={!selection} onClick={onClearSelection}>Clear</IconAction></Tooltip>
              <Tooltip text="Delete the active zone."><IconAction disabled={!activeZoneId} onClick={onDeleteZone}>Del zone</IconAction></Tooltip>
            </Actions>
          )}
        </PanelRow>
      )}
    </Panel>
  );
};
