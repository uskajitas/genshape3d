// ─────────────────────────────────────────────────────────────────────────────
// ImageActionsBar — the per-image toolbar that lives in the controller's
// header. Three controls today: Download, Regenerate, Ready-for-3D toggle.
//
// Wraps onto a second row at narrow widths so the title block on the left
// of ImageHeader is never squeezed off-screen.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';

interface Props {
  readyFor3D: boolean;
  onDownload: () => void;
  onToggleReadyFor3D: () => void;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const Group = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-end;
`;

const PillBtn = styled.button`
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
  &:hover {
    background: ${p => p.theme.colors.surface};
    border-color: ${p => p.theme.colors.borderHigh};
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

const ReadyBtn = styled.button<{ $on: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid ${p => (p.$on ? p.theme.colors.violet : p.theme.colors.border)};
  background: ${p => (p.$on ? `${p.theme.colors.violet}1a` : p.theme.colors.surfaceHigh)};
  color: ${p => (p.$on ? p.theme.colors.violet : p.theme.colors.textMuted)};
  font: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
  &:hover {
    background: ${p => (p.$on ? `${p.theme.colors.violet}2a` : p.theme.colors.surface)};
    color: ${p => p.theme.colors.text};
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

const ReadyDot = styled.span<{ $on: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${p => (p.$on ? p.theme.colors.violet : p.theme.colors.borderHigh)};
  flex-shrink: 0;
  box-shadow: ${p => (p.$on ? `0 0 8px ${p.theme.colors.violet}` : 'none')};
`;

// ── Component ────────────────────────────────────────────────────────────────

export const ImageActionsBar: React.FC<Props> = ({
  readyFor3D,
  onDownload,
  onToggleReadyFor3D,
}) => (
  <Group>
    <PillBtn type="button" onClick={onDownload}>⬇ Download</PillBtn>
    <ReadyBtn
      type="button"
      $on={readyFor3D}
      onClick={onToggleReadyFor3D}
      title={
        readyFor3D
          ? 'This image will appear in the 3D picker. Click to exclude.'
          : 'This image is excluded from the 3D picker. Click to include.'
      }
    >
      <ReadyDot $on={readyFor3D} />
      {readyFor3D ? 'Ready for 3D' : 'Excluded'}
    </ReadyBtn>
  </Group>
);
