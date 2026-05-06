// ─────────────────────────────────────────────────────────────────────────────
// ImageHeader — the top row of the ImageController:
//
//   [thumb]  [editable name]  [subtitle]              [actions toolbar]
//
// Subtitle is computed from the image's primary/alt-view status so the user
// always knows what they're looking at.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';
import { ImageNameEditor } from './ImageNameEditor';
import { ImageActionsBar } from './ImageActionsBar';
import type { ControlledImage } from './types';
import { VIEW_LABEL_DISPLAY, ViewLabel } from './types';

interface Props {
  image: ControlledImage;
  onChangeName: (next: string) => void;
  onDownload: () => void;
  onToggleReadyFor3D: () => void;
}

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.85rem;
`;

const Thumb = styled.img`
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid ${p => p.theme.colors.border};
`;

const TitleCol = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const Subtitle = styled.div`
  font-size: 0.62rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding-left: 4px;
`;

/** "Generated image" or "Alt view (Side)". Drives the subtitle line. */
function buildSubtitle(image: ControlledImage): string {
  if (image.isPrimary) return 'Generated image';
  const display =
    VIEW_LABEL_DISPLAY[image.viewLabel as ViewLabel] || image.viewLabel || '?';
  return `Alt view · ${display}`;
}

export const ImageHeader: React.FC<Props> = ({
  image,
  onChangeName,
  onDownload,
  onToggleReadyFor3D,
}) => (
  <Row>
    <Thumb src={image.url} alt="" />
    <TitleCol>
      <ImageNameEditor value={image.name} onChange={onChangeName} />
      <Subtitle>{buildSubtitle(image)}</Subtitle>
    </TitleCol>
    <ImageActionsBar
      readyFor3D={image.readyFor3D}
      onDownload={onDownload}
      onToggleReadyFor3D={onToggleReadyFor3D}
    />
  </Row>
);
