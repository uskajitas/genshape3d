// ─────────────────────────────────────────────────────────────────────────────
// Dropdown — custom select that matches the GenShape3D look.
//
// Pill-or-block trigger with subtle gradient, fade-in panel below, purple/pink
// gradient accent on the selected option, optional hint line per option,
// click-outside + Escape to close. Generic over the option value type so
// the same component drives Provider/Material/Aspect/etc.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  variant?: 'pill' | 'block';
  /** Optional small uppercase label baked into the trigger (e.g. "PROVIDER"). */
  label?: string;
  /** Forced width on the panel; defaults to fitting the trigger. */
  width?: number | string;
  align?: 'left' | 'right';
  disabled?: boolean;
}

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Wrap = styled.div`
  position: relative;
  display: inline-flex;
`;

const Trigger = styled.button<{ $variant: 'pill' | 'block'; $open: boolean; $disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  padding: ${p => p.$variant === 'pill' ? '0.42rem 0.95rem' : '0.45rem 0.7rem'};
  border-radius: ${p => p.$variant === 'pill' ? '999px' : '8px'};
  border: 1px solid ${p => p.$open ? p.theme.colors.violet : p.theme.colors.borderHigh};
  background: ${p => p.$open
    ? `linear-gradient(135deg, ${p.theme.colors.primary}33, ${p.theme.colors.violet}33)`
    : `linear-gradient(180deg, ${p.theme.colors.surfaceHigh}, ${p.theme.colors.surface})`};
  color: ${p => p.theme.colors.text};
  opacity: ${p => p.$disabled ? 0.5 : 1};
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  ${p => p.$open && `box-shadow: 0 0 0 3px ${p.theme.colors.violet}33;`}
  &:hover  { ${p => !p.$disabled && `border-color: ${p.theme.colors.violet};`} }
  &:disabled { pointer-events: none; }
`;

const TriggerLabel = styled.span`
  color: ${p => p.theme.colors.textMuted};
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.62rem;
`;

const TriggerValue = styled.span`
  color: ${p => p.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
`;

const Caret = styled.span<{ $open: boolean }>`
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.66rem;
  transition: transform 0.18s;
  transform: ${p => p.$open ? 'rotate(180deg)' : 'rotate(0deg)'};
  margin-left: 0.15rem;
`;

const Panel = styled.div<{ $align: 'left' | 'right'; $width?: number | string }>`
  position: absolute;
  top: calc(100% + 6px);
  ${p => p.$align === 'right' ? 'right: 0;' : 'left: 0;'}
  min-width: 100%;
  width: ${p => typeof p.$width === 'number' ? `${p.$width}px` : (p.$width || 'auto')};
  background: linear-gradient(180deg, ${p => p.theme.colors.surfaceHigh}, ${p => p.theme.colors.surface});
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 12px;
  padding: 0.35rem;
  box-shadow:
    0 14px 40px rgba(0, 0, 0, 0.55),
    0 0 0 1px ${p => p.theme.colors.violet}33,
    0 0 30px ${p => p.theme.colors.primary}1f;
  z-index: 200;
  animation: ${fadeIn} 0.14s ease;
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 360px;
  overflow-y: auto;
`;

const Item = styled.button<{ $active: boolean; $disabled?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 0.55rem 0.75rem 0.55rem 0.85rem;
  border-radius: 8px;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}26, ${p.theme.colors.violet}26)`
    : 'transparent'};
  color: ${p => p.$disabled ? p.theme.colors.textMuted : p.theme.colors.text};
  opacity: ${p => p.$disabled ? 0.5 : 1};
  transition: background 0.12s;
  position: relative;
  ${p => p.$active && `
    &::before {
      content: '';
      position: absolute;
      left: 0; top: 6px; bottom: 6px;
      width: 3px;
      border-radius: 0 2px 2px 0;
      background: linear-gradient(180deg, ${p.theme.colors.primary}, ${p.theme.colors.violet});
    }
  `}
  &:hover {
    ${p => !p.$disabled && !p.$active && `background: ${p.theme.colors.surfaceHigh};`}
  }
`;

const ItemLabel = styled.span`
  font-size: 0.84rem;
  font-weight: 600;
`;

const ItemHint = styled.span`
  font-size: 0.7rem;
  color: ${p => p.theme.colors.textMuted};
  font-weight: 400;
`;

export function Dropdown<T extends string>({
  value, options, onChange, variant = 'block', label,
  width, align = 'left', disabled = false,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside closes
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <Wrap ref={wrapRef}>
      <Trigger
        type="button"
        $variant={variant}
        $open={open}
        $disabled={disabled}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        {label && <TriggerLabel>{label}</TriggerLabel>}
        <TriggerValue>{current?.label ?? '—'}</TriggerValue>
        <Caret $open={open}>▾</Caret>
      </Trigger>
      {open && (
        <Panel $align={align} $width={width}>
          {options.map(opt => (
            <Item
              key={opt.value}
              type="button"
              $active={opt.value === value}
              $disabled={opt.disabled}
              onClick={() => {
                if (opt.disabled) return;
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <ItemLabel>{opt.label}</ItemLabel>
              {opt.hint && <ItemHint>{opt.hint}</ItemHint>}
            </Item>
          ))}
        </Panel>
      )}
    </Wrap>
  );
}

export default Dropdown;
