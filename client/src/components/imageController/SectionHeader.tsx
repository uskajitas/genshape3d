// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader — small uppercase heading with an optional right-slot.
//
// Used by ImageViewGrid, ImageViewsAndPromptRow, and ImageDetailsGrid so
// every section in the controller starts at the SAME baseline. Without a
// shared component the heights drift (e.g. one heading has just text, the
// other includes a 18px icon button) and the columns underneath fall out
// of vertical alignment.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';

interface Props {
  text: string;
  /** Optional element placed at the end of the heading row (icons, counts). */
  rightSlot?: React.ReactNode;
  /** Override the default violet accent. */
  accent?: string;
  /** When true, the heading is rendered in a quieter style — muted colour,
   *  smaller font, fainter underline. Use this for read-only data sections
   *  (e.g. ImageDetailsGrid) where the eye should land on the values. */
  subtle?: boolean;
}

const Row = styled.div<{ $subtle?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  /* Fixed min-height so a heading with NO right-slot lines up with one
     that has an 18px icon button. Matches the icon button's height + a
     touch of slack. */
  min-height: 18px;
  padding-bottom: ${p => (p.$subtle ? '0.18rem' : '0.3rem')};
  border-bottom: 1px solid
    ${p => (p.$subtle
      ? `${p.theme.colors.border}80`   /* half-strength */
      : p.theme.colors.border)};
`;

const Text = styled.div<{ $accent?: string; $subtle?: boolean }>`
  font-size: ${p => (p.$subtle ? '0.55rem' : '0.6rem')};
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p =>
    p.$subtle
      ? p.theme.colors.textMuted
      : (p.$accent ?? p.theme.colors.violet)};
  /* Align the small caps to the same baseline as the icon button. */
  line-height: 1.4;
`;

export const SectionHeader: React.FC<Props> = ({ text, rightSlot, accent, subtle }) => (
  <Row $subtle={subtle}>
    <Text $accent={accent} $subtle={subtle}>{text}</Text>
    {rightSlot}
  </Row>
);
