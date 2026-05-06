// ─────────────────────────────────────────────────────────────────────────────
// ImageDetailsGrid — the read-only sectioned label/value grid.
//
// Sections auto-flow into responsive columns (220px min). Each section has
// an UPPERCASE heading underline, then a vertical list of label/value rows.
// "Wide" rows span the section's full width (good for prompt-style content).
//
// Purely presentational — the parent passes `sections: DetailSection[]` and
// this component renders them. No data logic here.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';
import { SectionHeader } from './SectionHeader';
import type { DetailSection } from './types';

interface Props {
  sections: DetailSection[];
}

const Wrap = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  /* Tighter row gap (was 0.85rem) — the data grid is reference info, not
     the focal point of the panel. Same column gap to keep section
     boundaries clear. */
  gap: 0.6rem 1.4rem;
  align-items: start;
`;

const Section = styled.div<{ $full?: boolean }>`
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* Less air between the heading and its first row so the section reads
     as one block. */
  gap: 0.3rem;
  ${p => p.$full && `grid-column: 1 / -1;`}
`;

const Row = styled.div<{ $wide?: boolean }>`
  display: grid;
  grid-template-columns: ${p => (p.$wide ? '1fr' : '78px 1fr')};
  gap: ${p => (p.$wide ? '0.15rem' : '0.5rem')};
  /* Pack rows tightly — the section is short enough that air between
     rows just costs vertical real estate. */
  margin-bottom: 0.12rem;
  align-items: baseline;
  min-width: 0;
`;

const Label = styled.div`
  font-size: 0.62rem;
  font-weight: 500;
  color: ${p => p.theme.colors.textMuted};
  letter-spacing: 0.02em;
  white-space: nowrap;
  /* Slightly muted opacity so the eye lands on the value, not the label. */
  opacity: 0.85;
`;

const Value = styled.div<{ $mono?: boolean; $wide?: boolean }>`
  font-size: ${p => (p.$mono ? '0.7rem' : '0.76rem')};
  font-weight: 500;
  color: ${p => p.theme.colors.text};
  line-height: 1.4;
  font-family: ${p =>
    p.$mono
      ? `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      : 'inherit'};
  ${p =>
    p.$wide
      ? 'word-break: break-word;'
      : `
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `}
`;

export const ImageDetailsGrid: React.FC<Props> = ({ sections }) => (
  <Wrap>
    {sections.map((s, i) => (
      <Section key={i} $full={s.fullWidth}>
        {/* Subtle headers — these sections are reference info, not the
            focal point. The Views and Prompt headings above stay bright
            because that's where the user actually does things. */}
        <SectionHeader text={s.heading} accent={s.accent} subtle />
        {s.rows.map((r, j) => (
          <Row key={j} $wide={r.wide}>
            {r.wide
              ? <Label style={{ marginBottom: 2 }}>{r.label}</Label>
              : <Label>{r.label}</Label>}
            <Value $mono={r.mono} $wide={r.wide}>
              {r.value ?? <span style={{ opacity: 0.4 }}>—</span>}
            </Value>
          </Row>
        ))}
      </Section>
    ))}
  </Wrap>
);
