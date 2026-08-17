// ─────────────────────────────────────────────────────────────────────────────
// PanelKit — Tabs, Accordion, and labeled setting rows shared by all tool panels.
//
// The inspector is going to keep growing (materials, HDRI, render passes…),
// so every group of settings lives in an Accordion inside a Tab. Adding a
// new group = one <Accordion title="…"> block, nothing else. All colours
// come from the theme (see client/CLAUDE.md — no raw HTML controls).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import styled from 'styled-components';

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TabBar = styled.div`
  display: flex; gap: 0.25rem;
  padding: 0.3rem;
  border-radius: 10px;
  background: ${p => p.theme.colors.background};
  border: 1px solid ${p => p.theme.colors.border};
`;

const TabBtn = styled.button<{ $active?: boolean }>`
  flex: 1; font: inherit; font-size: 0.74rem; font-weight: 700;
  padding: 0.4rem 0.5rem; border-radius: 7px; cursor: pointer;
  border: 0;
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}33, ${p.theme.colors.violet}33)`
    : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  transition: background 0.12s, color 0.12s;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

export function Tabs({ tabs, active, onChange }: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <TabBar>
      {tabs.map(t => (
        <TabBtn key={t.key} $active={t.key === active} onClick={() => onChange(t.key)}>
          {t.label}
        </TabBtn>
      ))}
    </TabBar>
  );
}

// ── Accordion ────────────────────────────────────────────────────────────────

const AccWrap = styled.div`
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  background: ${p => p.theme.colors.surface};
  overflow: hidden;
`;

const AccHeader = styled.button<{ $open?: boolean }>`
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%; font: inherit; font-size: 0.72rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.06em;
  padding: 0.55rem 0.7rem; cursor: pointer; border: 0;
  background: ${p => p.$open ? p.theme.colors.surfaceHigh : 'transparent'};
  color: ${p => p.$open ? p.theme.colors.text : p.theme.colors.textMuted};
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const AccCaret = styled.span<{ $open?: boolean }>`
  font-size: 0.6rem;
  transition: transform 0.15s;
  transform: ${p => p.$open ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const AccBadge = styled.span`
  margin-left: auto;
  font-size: 0.66rem; font-weight: 700;
  color: ${p => p.theme.colors.violet};
`;

const AccBody = styled.div`
  display: flex; flex-direction: column; gap: 0.55rem;
  padding: 0.7rem;
  border-top: 1px solid ${p => p.theme.colors.border};
`;

export function Accordion({ title, badge, defaultOpen = true, children }: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <AccWrap>
      <AccHeader $open={open} onClick={() => setOpen(o => !o)}>
        <AccCaret $open={open}>▶</AccCaret>
        {title}
        {badge && <AccBadge>{badge}</AccBadge>}
      </AccHeader>
      {open && <AccBody>{children}</AccBody>}
    </AccWrap>
  );
}

// ── Setting rows ─────────────────────────────────────────────────────────────

export const Row = styled.div`
  display: flex; align-items: center; gap: 0.5rem;
`;

export const RowLabel = styled.div`
  flex: 0 0 76px;
  font-size: 0.7rem; font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
`;

export const RowValue = styled.div`
  font-size: 0.72rem; font-weight: 600; min-width: 34px; text-align: right;
  color: ${p => p.theme.colors.text};
`;

const SliderInput = styled.input`
  flex: 1; min-width: 0;
  accent-color: ${p => p.theme.colors.violet};
`;

export function SliderRow({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <Row>
      <RowLabel>{label}</RowLabel>
      <SliderInput type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} />
      <RowValue>{format ? format(value) : value.toFixed(2)}</RowValue>
    </Row>
  );
}

const NumInput = styled.input`
  font: inherit; font-size: 0.76rem;
  padding: 0.3rem 0.35rem; border-radius: 6px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  width: 100%; min-width: 0;
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const VecGrid = styled.div`
  flex: 1; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.3rem;
`;

export function Vec3Row({ label, value, step = 0.1, onChange }: {
  label: string;
  value: [number, number, number];
  step?: number;
  onChange: (axis: 0 | 1 | 2, v: number) => void;
}) {
  return (
    <Row>
      <RowLabel>{label}</RowLabel>
      <VecGrid>
        {([0, 1, 2] as const).map(axis => (
          <NumInput
            key={axis}
            type="number"
            step={step}
            value={Number(value[axis].toFixed(2))}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (isFinite(v)) onChange(axis, v);
            }}
          />
        ))}
      </VecGrid>
    </Row>
  );
}

// Native colour input wrapped to match the theme: the swatch is the control.
const ColorWell = styled.input`
  appearance: none; -webkit-appearance: none;
  width: 34px; height: 24px; padding: 0;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 6px; cursor: pointer; background: transparent;
  &::-webkit-color-swatch-wrapper { padding: 2px; }
  &::-webkit-color-swatch { border: 0; border-radius: 4px; }
  &::-moz-color-swatch { border: 0; border-radius: 4px; }
`;

const ColorHex = styled.span`
  font-size: 0.7rem; font-weight: 600; color: ${p => p.theme.colors.textMuted};
  text-transform: uppercase;
`;

export function ColorRow({ label, value, onChange }: {
  label: string; value: string; onChange: (hex: string) => void;
}) {
  return (
    <Row>
      <RowLabel>{label}</RowLabel>
      <ColorWell type="color" value={value} onChange={e => onChange(e.target.value)} />
      <ColorHex>{value}</ColorHex>
    </Row>
  );
}

// Toggle switch (same visual language as the chips/checkboxes elsewhere).
const ToggleTrack = styled.button<{ $on?: boolean }>`
  position: relative; flex-shrink: 0;
  width: 34px; height: 19px; border-radius: 999px; cursor: pointer;
  border: 1px solid ${p => p.$on ? p.theme.colors.violet : p.theme.colors.borderHigh};
  background: ${p => p.$on
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : p.theme.colors.surfaceHigh};
  transition: background 0.15s, border-color 0.15s;
  &::after {
    content: '';
    position: absolute; top: 2px;
    left: ${p => p.$on ? '16px' : '2px'};
    width: 13px; height: 13px; border-radius: 50%;
    background: white;
    transition: left 0.15s;
  }
`;

export function ToggleRow({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <Row>
      <RowLabel>{label}</RowLabel>
      <ToggleTrack type="button" $on={value} onClick={() => onChange(!value)} aria-pressed={value} />
    </Row>
  );
}

// Small action button used inside accordion bodies.
export const MiniBtn = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  font: inherit; font-size: 0.72rem; font-weight: 700;
  padding: 0.38rem 0.7rem; border-radius: 7px; cursor: pointer;
  border: 1px solid ${p => p.$danger ? '#EF4444' : p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$danger ? '#EF4444' : p.$primary ? 'white' : p.theme.colors.text};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;

export const BtnRow = styled.div`
  display: flex; gap: 0.4rem; flex-wrap: wrap;
`;
