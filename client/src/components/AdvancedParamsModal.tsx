// ─────────────────────────────────────────────────────────────────────────────
// AdvancedParamsModal — full-screen modal for shape-generation parameters.
//
// Shown to admin users only. Receives current param values and fires onChange
// with a full updated set. Changes are applied immediately (not staged) so the
// panel's "⚙ Fine-tune" link always reflects live values.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import styled, { keyframes } from 'styled-components';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AdvancedParams {
  octree:   number;
  steps:    number;
  guidance: number;
  faces:    number;
  chunks:   number;
  seed:     number;
}

export interface MeshTypePreset extends Omit<AdvancedParams, 'seed'> {
  id:    string;
  label: string;
  desc:  string;
  hint:  string;
}

export const MESH_TYPE_PRESETS: MeshTypePreset[] = [
  {
    id: 'hard', label: 'Hard Surface',
    desc: 'Weapons, vehicles, architecture, machinery — any object with flat planes, sharp corners, or defined edges.',
    hint: '~5 min',
    octree: 512, steps: 20, guidance: 8, faces: 200_000, chunks: 2000,
  },
  {
    id: 'organic', label: 'Organic',
    desc: 'Characters, creatures, plants, rocks, natural forms — surfaces that are meant to look soft or naturally irregular.',
    hint: '~3 min',
    octree: 384, steps: 12, guidance: 5, faces: 80_000, chunks: 4000,
  },
  {
    id: 'prop', label: 'Prop',
    desc: 'Furniture, food, tools, everyday objects — a balanced middle ground between sharpness and naturalness.',
    hint: '~2 min',
    octree: 384, steps: 10, guidance: 6, faces: 100_000, chunks: 4000,
  },
  {
    id: 'draft', label: 'Draft',
    desc: 'Quick silhouette check only — lowest quality, fastest output. Use to validate the image before committing to a full run.',
    hint: '~20s',
    octree: 256, steps: 5, guidance: 5, faces: 30_000, chunks: 8000,
  },
];

// ─── Styled components ────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Backdrop = styled.div`
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
  animation: ${fadeIn} 0.15s ease;
  padding: 1.5rem;
`;

const Sheet = styled.div`
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 16px;
  width: 100%;
  max-width: 860px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  animation: ${slideUp} 0.2s ease;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.75rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  flex-shrink: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  flex: 1;
`;

const CloseBtn = styled.button`
  background: none; border: none; padding: 0.25rem;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer; font-size: 1.1rem; line-height: 1;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: 300px 1fr;
  overflow: hidden;
  flex: 1;
  min-height: 0;
`;

const LeftCol = styled.div`
  padding: 1.5rem 1.25rem;
  border-right: 1px solid ${p => p.theme.colors.border};
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const RightCol = styled.div`
  padding: 1.5rem 1.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const SectionLabel = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.5rem;
`;

const TypeCard = styled.button<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1.5px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}18, ${p.theme.colors.violet}18)`
    : p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: ${p => p.$active ? p.theme.colors.violet : p.theme.colors.borderHigh}; }
`;

const TypeCardLabel = styled.span`
  font-size: 0.88rem;
  font-weight: 700;
`;

const TypeCardHint = styled.span`
  font-size: 0.7rem;
  color: ${p => p.theme.colors.violet};
  font-weight: 600;
`;

const TypeCardDesc = styled.span`
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.4;
`;

const ParamRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ParamHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
`;

const ParamName = styled.span`
  font-size: 0.85rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
`;

const ParamValue = styled.span`
  font-size: 0.78rem;
  font-weight: 700;
  color: ${p => p.theme.colors.violet};
`;

const ParamOptions = styled.div`
  display: flex;
  gap: 4px;
  margin-left: auto;
`;

const OptionChip = styled.button<{ $active?: boolean }>`
  font: inherit;
  font-size: 0.68rem;
  padding: 2px 8px;
  border-radius: 5px;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active ? `${p.theme.colors.violet}28` : 'transparent'};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  &:hover { border-color: ${p => p.theme.colors.violet}; }
`;

const Slider = styled.input`
  width: 100%;
  accent-color: ${p => p.theme.colors.violet};
  cursor: pointer;
`;

const ParamDesc = styled.p`
  margin: 0;
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.5;
`;

const ParamDivider = styled.hr`
  border: none;
  border-top: 1px solid ${p => p.theme.colors.border};
  margin: 0;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.75rem;
  border-top: 1px solid ${p => p.theme.colors.border};
  flex-shrink: 0;
`;

const FooterNote = styled.div`
  flex: 1;
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
`;

const Btn = styled.button<{ $primary?: boolean }>`
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.55rem 1.25rem;
  border-radius: 8px;
  border: 1px solid ${p => p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  &:hover { opacity: 0.85; }
`;

// ─── Param definitions ────────────────────────────────────────────────────────

interface ParamDef {
  key: keyof AdvancedParams;
  label: string;
  min: number;
  max: number;
  step: number;
  options?: number[];
  desc: string;
}

const PARAM_DEFS: ParamDef[] = [
  {
    key: 'octree', label: 'Octree resolution',
    min: 128, max: 512, step: 128,
    options: [256, 384, 512],
    desc:
      'Sets the voxel grid resolution the shape DiT uses internally. ' +
      'Higher = the model can represent finer geometric detail and sharper corners. ' +
      'Hard surface objects (buildings, weapons) need 512 to avoid rounded-off edges. ' +
      'Organic shapes are fine at 384. 512 uses significantly more VRAM and is slower.',
  },
  {
    key: 'steps', label: 'Inference steps',
    min: 1, max: 50, step: 1,
    options: [5, 10, 20, 35],
    desc:
      '≤10 uses the fast Turbo checkpoint — quick but less detailed. ' +
      '>10 switches to the full model for finer surface geometry. ' +
      'Hard surfaces benefit from 20–30 to resolve tight edge loops. ' +
      'Organic shapes are often fine at 10–15. Diminishing returns above 35.',
  },
  {
    key: 'guidance', label: 'Guidance scale',
    min: 1, max: 12, step: 0.5,
    options: [5, 6, 7, 8, 9],
    desc:
      'Controls how faithfully the model follows your input image vs interpreting freely. ' +
      'High (7–9): model hugs the silhouette and surface features — good for hard surface where ' +
      'the image edge IS the mesh edge. ' +
      'Low (5–6): model interprets loosely — better for organic shapes that should look natural. ' +
      'Above 9 causes over-saturation and surface artifacts.',
  },
  {
    key: 'faces', label: 'Target face count',
    min: 10_000, max: 500_000, step: 10_000,
    options: [30_000, 80_000, 200_000, 400_000],
    desc:
      'Post-processing only — does not affect generation quality. ' +
      'After the mesh is generated, a simplification pass reduces polygon count to this target. ' +
      'Hard surface needs more polygons to preserve edge loops (200k+). ' +
      'Organic shapes forgive heavy simplification (50k–100k is game-ready). ' +
      'Higher = more detail preserved, larger file.',
  },
  {
    key: 'chunks', label: 'Num chunks',
    min: 500, max: 20_000, step: 500,
    options: [1000, 2000, 4000, 8000],
    desc:
      'The volume decoder processes the mesh in chunks. Fewer chunks = ' +
      'larger chunks = smoother join seams between them. ' +
      'Keep at 1k–4k for clean output. Raise only if you hit GPU out-of-memory. ' +
      'This is a memory/seam trade-off — it does not affect the generated shape detail.',
  },
  {
    key: 'seed', label: 'Seed',
    min: 0, max: 2_147_483_647, step: 1,
    desc:
      '0 = random each run. Any positive integer = reproducible output for the same image and params. ' +
      'Use a fixed seed when comparing parameter changes on the same input so only the params vary.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  values: AdvancedParams;
  activePreset: string | null;
  onChange: (values: AdvancedParams, presetId: string | null) => void;
}

export const AdvancedParamsModal: React.FC<Props> = ({
  open, onClose, values, activePreset, onChange,
}) => {
  const [draft, setDraft] = useState<AdvancedParams>(values);
  const [draftPreset, setDraftPreset] = useState<string | null>(activePreset);

  // Sync when opened
  useEffect(() => {
    if (open) {
      setDraft(values);
      setDraftPreset(activePreset);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const applyPreset = (p: MeshTypePreset) => {
    const next: AdvancedParams = {
      octree: p.octree, steps: p.steps, guidance: p.guidance,
      faces: p.faces, chunks: p.chunks, seed: draft.seed,
    };
    setDraft(next);
    setDraftPreset(p.id);
  };

  const setParam = (key: keyof AdvancedParams, value: number) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setDraftPreset(null);
  };

  const handleApply = () => {
    onChange(draft, draftPreset);
    onClose();
  };

  const handleReset = () => {
    const preset = MESH_TYPE_PRESETS.find(p => p.id === draftPreset);
    if (preset) applyPreset(preset);
  };

  return (
    <Backdrop onClick={onClose}>
      <Sheet onClick={e => e.stopPropagation()}>
        <Header>
          <Title>Shape generation parameters</Title>
          <CloseBtn onClick={onClose}>✕</CloseBtn>
        </Header>

        <Body>
          {/* Left: mesh type presets */}
          <LeftCol>
            <SectionLabel>Mesh type</SectionLabel>
            <div style={{ fontSize: '0.72rem', color: '#71717a', lineHeight: 1.5, marginTop: -4, marginBottom: 4 }}>
              Pick the type that matches your subject. This sets all params at once — you can tweak
              individual values on the right afterwards.
            </div>
            {MESH_TYPE_PRESETS.map(p => (
              <TypeCard
                key={p.id}
                type="button"
                $active={draftPreset === p.id}
                onClick={() => applyPreset(p)}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <TypeCardLabel>{p.label}</TypeCardLabel>
                  <TypeCardHint>{p.hint}</TypeCardHint>
                </div>
                <TypeCardDesc>{p.desc}</TypeCardDesc>
              </TypeCard>
            ))}
          </LeftCol>

          {/* Right: individual param controls */}
          <RightCol>
            <SectionLabel>Individual parameters</SectionLabel>
            {PARAM_DEFS.map((def, i) => {
              const val = draft[def.key];
              return (
                <React.Fragment key={def.key}>
                  {i > 0 && <ParamDivider />}
                  <ParamRow>
                    <ParamHeader>
                      <ParamName>{def.label}</ParamName>
                      <ParamValue>{typeof val === 'number' && val % 1 !== 0 ? val.toFixed(1) : val}</ParamValue>
                      {def.options && (
                        <ParamOptions>
                          {def.options.map(o => (
                            <OptionChip
                              key={o}
                              type="button"
                              $active={val === o}
                              onClick={() => setParam(def.key, o)}
                            >
                              {o >= 1000 ? `${(o / 1000).toFixed(0)}k` : o}
                            </OptionChip>
                          ))}
                        </ParamOptions>
                      )}
                    </ParamHeader>
                    <Slider
                      type="range"
                      min={def.min} max={def.max} step={def.step}
                      value={val}
                      onChange={e => setParam(def.key, parseFloat(e.target.value))}
                    />
                    <ParamDesc>{def.desc}</ParamDesc>
                  </ParamRow>
                </React.Fragment>
              );
            })}
          </RightCol>
        </Body>

        <Footer>
          <FooterNote>
            {draftPreset
              ? `Using: ${MESH_TYPE_PRESETS.find(p => p.id === draftPreset)?.label ?? draftPreset}`
              : 'Custom — no preset active'}
          </FooterNote>
          <Btn type="button" onClick={handleReset} disabled={!draftPreset}>
            Reset to preset
          </Btn>
          <Btn type="button" $primary onClick={handleApply}>
            Apply
          </Btn>
        </Footer>
      </Sheet>
    </Backdrop>
  );
};
