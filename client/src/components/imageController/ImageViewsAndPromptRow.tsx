// ─────────────────────────────────────────────────────────────────────────────
// ImageViewsAndPromptRow — horizontal row that holds:
//
//   [ ImageViewGrid ]   [ Prompt block with optional ⓘ composed-prompt ]
//
// Putting these two side-by-side instead of stacked saves a chunk of
// vertical space inside the controller, which keeps the panel within the
// max-height without forcing the user to scroll to read the prompt.
//
// The prompt block grows to fill remaining horizontal space; the views grid
// keeps its natural width. On narrow viewports the row wraps so the prompt
// drops below the grid.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import styled from 'styled-components';
import { ImageViewGrid } from './ImageViewGrid';
import { SectionHeader } from './SectionHeader';
import { ComposedPromptDialog } from './ComposedPromptDialog';
import { IconInfo } from '../Icons';
import type { ControlledAltView, ViewLabel } from './types';

interface Props {
  prompt: string;
  composedPrompt?: string;

  // ImageViewGrid props (forwarded as-is).
  altViews: ControlledAltView[];
  busyViewLabels: Set<ViewLabel>;
  primaryImageId: string;
  primaryImageUrl: string;
  primaryViewLabel: ViewLabel;
  onGenerateView: (label: ViewLabel) => void;
  onSelectView: (id: string) => void;
  onDeleteView: (id: string) => void;
  onRegenerateView: (label: ViewLabel, currentId: string) => void;
  /** Admin-only cost label forwarded to each slot. */
  adminCost?: string;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 1.4rem;
`;

const ViewsCol = styled.div`
  flex: 0 0 auto;
  min-width: 0;
`;

const PromptCol = styled.div`
  flex: 1 1 320px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* Match ImageViewGrid's section gap so the heading + body offsets are
     identical and the columns sit on the same baselines. */
  gap: 0.5rem;
`;

const ComposedInfoBtn = styled.button`
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid transparent;
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  transition: color 140ms ease, background 140ms ease, border-color 140ms ease;
  & > svg { display: block; }
  &:hover {
    color: ${p => p.theme.colors.violet};
    border-color: ${p => p.theme.colors.violet}55;
    background: ${p => p.theme.colors.violet}12;
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

const PromptBody = styled.div`
  font-size: 0.85rem;
  line-height: 1.5;
  color: ${p => p.theme.colors.text};
  word-break: break-word;
  white-space: normal;
`;

// ── Component ────────────────────────────────────────────────────────────────

export const ImageViewsAndPromptRow: React.FC<Props> = ({
  prompt,
  composedPrompt,
  altViews,
  busyViewLabels,
  primaryImageId,
  primaryImageUrl,
  primaryViewLabel,
  onGenerateView,
  onSelectView,
  onDeleteView,
  onRegenerateView,
  adminCost,
}) => {
  const [composedOpen, setComposedOpen] = useState(false);

  // The ⓘ button next to "Prompt" — opens the composed-prompt modal so
  // the user can select / copy parts of it. Hidden when there's no
  // composed prompt to show (e.g. an asset that pre-dates server-side
  // composition).
  const composedInfoSlot = composedPrompt ? (
    <ComposedInfoBtn
      type="button"
      aria-label="Show composed prompt"
      title="Show composed prompt"
      onClick={() => setComposedOpen(true)}
    >
      <IconInfo size={12} />
    </ComposedInfoBtn>
  ) : null;

  return (
    <>
      <Row>
        <ViewsCol>
          <ImageViewGrid
            altViews={altViews}
            busyViewLabels={busyViewLabels}
            primaryImageId={primaryImageId}
            primaryImageUrl={primaryImageUrl}
            primaryViewLabel={primaryViewLabel}
            onGenerateView={onGenerateView}
            onSelectView={onSelectView}
            onDeleteView={onDeleteView}
            onRegenerateView={onRegenerateView}
            adminCost={adminCost}
          />
        </ViewsCol>
        <PromptCol>
          <SectionHeader text="Prompt" rightSlot={composedInfoSlot} />
          <PromptBody>
            {prompt || <span style={{ opacity: 0.4 }}>—</span>}
          </PromptBody>
        </PromptCol>
      </Row>
      <ComposedPromptDialog
        open={composedOpen}
        text={composedPrompt || ''}
        onClose={() => setComposedOpen(false)}
      />
    </>
  );
};
