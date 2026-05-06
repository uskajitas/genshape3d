// ─────────────────────────────────────────────────────────────────────────────
// ImageViewSlot — one slot in the 6-slot view grid.
//
// Three render states, mutually exclusive:
//   ┌─────────┐
//   │ filled  │  has an alt view: shows thumb. Click → select. Hover → ×.
//   │ busy    │  generation in flight: shows spinner.
//   │ empty   │  no alt view yet: shows + button. Click → generate.
//   └─────────┘
//
// The slot is square; the viewLabel is shown as a small label below the box.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled, { keyframes } from 'styled-components';
import { IconClose, IconRefresh } from '../Icons';
import { Tooltip } from '../Tooltip';
import type { ViewLabel } from './types';
import { VIEW_LABEL_DISPLAY } from './types';

interface Props {
  label: ViewLabel;
  /** Provided when the slot is "filled" — id + thumb url of the alt view. */
  filled?: { id: string; url: string };
  /** True when a generation request is in flight for this label. */
  busy: boolean;
  /** True when this slot represents the parent / primary image (no actions). */
  isPrimarySource?: boolean;

  onGenerate: (label: ViewLabel) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  /** Regenerate this slot — caller deletes the existing alt view (if any)
   *  and immediately kicks off a fresh generation at the same angle. The
   *  ↻ control only renders on filled, non-primary slots. */
  onRegenerate?: (label: ViewLabel, currentId: string) => void;
  /** ADMIN-ONLY cost label. When defined, hovering the + / ↻ button
   *  shows it in a gold-toned tooltip. Hidden entirely for non-admins. */
  adminCost?: string;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
`;

const Tile = styled.div<{ $filled?: boolean; $primary?: boolean }>`
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: 1.5px solid ${p =>
    p.$primary ? p.theme.colors.violet :
    p.$filled  ? p.theme.colors.border : p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${p => (p.$filled ? 'pointer' : 'default')};
  transition: border-color 160ms ease, transform 120ms ease;
  &:hover { border-color: ${p => p.theme.colors.violet}; }
`;

const ThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const PrimaryBadge = styled.span`
  position: absolute;
  top: 3px;
  left: 3px;
  font-size: 0.5rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: ${p => p.theme.colors.violet};
  color: white;
  padding: 1px 5px;
  border-radius: 3px;
  pointer-events: none;
`;

const PlusBtn = styled.button`
  width: 100%; height: 100%;
  background: transparent;
  border: 0;
  color: ${p => p.theme.colors.textMuted};
  font-size: 1.4rem;
  font-weight: 300;
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease;
  &:hover {
    color: ${p => p.theme.colors.violet};
    background: ${p => p.theme.colors.violet}10;
  }
`;

// Per-slot mini button — used for both Regenerate and Delete on hover.
// They share the same visual language; positioning is handled by parent
// styled wrappers (TopRight / TopLeft) so the layout is explicit.
const SlotMiniBtn = styled.button`
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(8, 6, 16, 0.7);
  backdrop-filter: blur(6px);
  color: rgba(255,255,255,0.92);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  font-size: 0;
  padding: 0;
  opacity: 0;
  transition: opacity 140ms ease, background 160ms ease, border-color 160ms ease;
  ${Tile}:hover & { opacity: 1; }
  &:hover {
    background: ${p => p.theme.colors.violet};
    border-color: ${p => p.theme.colors.violet};
  }
  & > svg { display: block; }
`;

const DeleteX = styled(SlotMiniBtn)`
  top: 3px;
  right: 3px;
`;

const RegenBtn = styled(SlotMiniBtn)`
  top: 3px;
  /* Sits to the LEFT of the delete X so they form a small toolbar in
     the top-right corner of the slot. */
  right: 24px;
`;

const Spinner = styled.div`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid ${p => p.theme.colors.borderHigh};
  border-top-color: ${p => p.theme.colors.violet};
  animation: ${spin} 0.7s linear infinite;
`;

const Caption = styled.div<{ $primary?: boolean }>`
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${p => (p.$primary ? p.theme.colors.violet : p.theme.colors.textMuted)};
`;

// ── Component ────────────────────────────────────────────────────────────────

export const ImageViewSlot: React.FC<Props> = ({
  label,
  filled,
  busy,
  isPrimarySource,
  onGenerate,
  onSelect,
  onDelete,
  onRegenerate,
  adminCost,
}) => {
  const captionText = VIEW_LABEL_DISPLAY[label];

  // Wrap a button in the admin cost tooltip iff a cost was passed
  // (i.e. the current user is admin). Non-admins get the bare button.
  const wrapWithCostTip = (node: React.ReactElement) =>
    adminCost
      ? <Tooltip text={adminCost} placement="top" tone="admin">{node}</Tooltip>
      : node;

  // Render order matters: busy beats filled beats empty.
  let inner: React.ReactNode;
  if (busy) {
    inner = <Spinner aria-label={`Generating ${captionText}`} />;
  } else if (filled) {
    inner = (
      <>
        <ThumbImg
          src={filled.url}
          alt={captionText}
          onClick={() => onSelect(filled.id)}
        />
        {isPrimarySource && <PrimaryBadge>orig</PrimaryBadge>}
        {!isPrimarySource && onRegenerate && wrapWithCostTip(
          <RegenBtn
            type="button"
            aria-label={`Regenerate ${captionText} view`}
            title={`Regenerate ${captionText.toLowerCase()} view`}
            onClick={(e) => { e.stopPropagation(); onRegenerate(label, filled.id); }}
          >
            <IconRefresh size={10} />
          </RegenBtn>
        )}
        {!isPrimarySource && (
          <DeleteX
            type="button"
            aria-label={`Delete ${captionText} view`}
            title={`Delete ${captionText.toLowerCase()} view`}
            onClick={(e) => { e.stopPropagation(); onDelete(filled.id); }}
          >
            <IconClose size={11} />
          </DeleteX>
        )}
      </>
    );
  } else {
    inner = wrapWithCostTip(
      <PlusBtn
        type="button"
        aria-label={`Generate ${captionText} view`}
        onClick={() => onGenerate(label)}
        title={`Generate ${captionText.toLowerCase()} view`}
      >
        +
      </PlusBtn>
    );
  }

  return (
    <Wrap>
      <Tile $filled={!!filled} $primary={isPrimarySource}>
        {inner}
      </Tile>
      <Caption $primary={isPrimarySource}>{captionText}</Caption>
    </Wrap>
  );
};
