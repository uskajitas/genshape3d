// ─────────────────────────────────────────────────────────────────────────────
// ImageController — bottom-of-viewport panel that becomes the "central
// control" for the currently-selected image in TextToImage.
//
// Composition:
//
//   ┌────────────────────────────────────────────────────────────────┐
//   │  ImageHeader      — thumb + editable name + actions toolbar    │
//   │  ImageViewGrid    — 6 view slots (front / 3-4 / side / …)      │
//   │  ImageDetailsGrid — sectioned read-only label/value grid       │
//   └────────────────────────────────────────────────────────────────┘
//
// Visibility: hidden when no image is selected. We also gracefully handle
// the case where `image` is null even when `visible` is true (returns null)
// so the parent doesn't have to special-case it.
//
// All side-effects (rename, regenerate, alt-view generation, deletion) are
// delegated to the parent via callbacks. This component owns NO state.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';
import { ImageHeader } from './ImageHeader';
import { ImageViewsAndPromptRow } from './ImageViewsAndPromptRow';
import { ImageDetailsGrid } from './ImageDetailsGrid';
import type { ImageControllerProps, ViewLabel } from './types';

const Panel = styled.section<{ $visible: boolean }>`
  flex-shrink: 0;
  display: ${p => (p.$visible ? 'flex' : 'none')};
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.25rem 1.1rem;
  background: ${p => p.theme.colors.surface};
  border-top: 1px solid ${p => p.theme.colors.border};
  color: ${p => p.theme.colors.text};
  max-height: 48vh;
  overflow-y: auto;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: ${p => p.theme.colors.borderHigh};
    border-radius: 3px;
  }
`;

export const ImageController: React.FC<ImageControllerProps> = ({
  visible,
  image,
  primaryImage,
  altViews,
  busyViewLabels,
  prompt,
  composedPrompt,
  adminCostPerView,
  detailSections,
  onChangeName,
  onDownload,
  onToggleReadyFor3D,
  onGenerateView,
  onDeleteView,
  onSelectView,
  onRegenerateView,
}) => {
  if (!visible || !image || !primaryImage) return null;

  const primaryViewLabel = (primaryImage.viewLabel as ViewLabel) || 'front';

  return (
    <Panel $visible={visible}>
      <ImageHeader
        image={image}
        onChangeName={onChangeName}
        onDownload={onDownload}
        onToggleReadyFor3D={onToggleReadyFor3D}
      />
      <ImageViewsAndPromptRow
        prompt={prompt}
        composedPrompt={composedPrompt}
        altViews={altViews}
        busyViewLabels={busyViewLabels}
        primaryImageId={primaryImage.id}
        primaryImageUrl={primaryImage.url}
        primaryViewLabel={primaryViewLabel}
        onGenerateView={onGenerateView}
        onSelectView={onSelectView}
        onDeleteView={onDeleteView}
        onRegenerateView={onRegenerateView}
        adminCost={adminCostPerView}
      />
      <ImageDetailsGrid sections={detailSections} />
    </Panel>
  );
};
