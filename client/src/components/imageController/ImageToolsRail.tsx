// ─────────────────────────────────────────────────────────────────────────────
// ImageToolsRail — vertical icon-button column that lives on the RIGHT
// edge of the StageWrap, alongside the BigImage. Each button opens a
// tool dialog or applies an action. Currently:
//
//   ▣  Edit background — opens BgRemovalDialog
//
// More tools (crop, brightness, mask paint, …) can drop in here without
// touching the page layout.
//
// The rail only renders when there's a selected image. Sits in its own
// flex column so the BigImage stays centered in the remaining space.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';
import { Tooltip } from '../Tooltip';
import { IconCutout } from '../Icons';

export interface ImageTool {
  /** Stable id (used as React key + aria). */
  id: string;
  /** Tooltip text shown on hover. */
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Optional admin-only cost shown in a gold tooltip. */
  adminCost?: string;
  disabled?: boolean;
}

interface Props {
  tools: ImageTool[];
}

// ── Styles ───────────────────────────────────────────────────────────────────

const Rail = styled.aside`
  flex-shrink: 0;
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0;
`;

const ToolBtn = styled.button`
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 10px;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
  & > svg { display: block; }
  &:hover:not(:disabled) {
    background: ${p => p.theme.colors.surface};
    border-color: ${p => p.theme.colors.violet};
    color: ${p => p.theme.colors.violet};
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// ── Component ────────────────────────────────────────────────────────────────

export const ImageToolsRail: React.FC<Props> = ({ tools }) => (
  <Rail aria-label="Image tools">
    {tools.map(t => {
      const btn = (
        <ToolBtn
          key={t.id}
          type="button"
          aria-label={t.label}
          disabled={t.disabled}
          onClick={t.onClick}
        >
          {t.icon}
        </ToolBtn>
      );
      // The tooltip shows the label plus, for admins, the action cost in
      // gold tone. Non-admins get the plain label only.
      const tipText = t.adminCost ? `${t.label}  ·  ${t.adminCost}` : t.label;
      const tone: 'default' | 'admin' = t.adminCost ? 'admin' : 'default';
      return (
        <Tooltip key={t.id} text={tipText} placement="left" tone={tone}>
          {btn}
        </Tooltip>
      );
    })}
  </Rail>
);

// Re-export the cutout icon for convenience — page-level code uses it
// when wiring up the bg-removal tool.
export { IconCutout };
