// ─────────────────────────────────────────────────────────────────────────────
// DetailOverlay — a bottom-anchored info strip that lives INSIDE the centre
// viewport. Shows full prompt / params / status detail for whichever asset
// the user is currently inspecting (typically the right-rail-hovered one).
//
// Design intent: this should NOT feel like a floating tooltip. It's a
// structural strip — flush with the viewport bottom edge, theme-coloured,
// no glassy popup, no slide-in pop animation. Think Spotify's "now playing"
// bar or a media-player metadata strip: integrated, not transient.
//
// The component is purely presentational. Parents build their own
// `fields[]` from whatever data shape they have. Render it inside a
// `position: relative` ancestor (the Viewport) so the strip's
// `position: absolute; bottom` anchors correctly.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';

export interface DetailField {
  label: string;
  value: React.ReactNode;
  /** Use a wider chip for prompt-like long-text fields. */
  wide?: boolean;
  /** Render value in monospace (good for IDs, seeds, composed prompts). */
  mono?: boolean;
}

export interface DetailOverlayProps {
  title: string;
  subtitle?: string;
  status?: { label: string; color: string };
  fields: DetailField[];
  visible: boolean;
  thumbUrl?: string;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const Strip = styled.div<{ $visible: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* Top fade gradient blends the strip into the viewport above instead
     of capping it with a hard line — feels more architectural. A thin
     1px highlight along the actual top edge gives it definition. */
  background:
    linear-gradient(
      180deg,
      transparent 0%,
      ${p => p.theme.colors.background}cc 28%,
      ${p => p.theme.colors.background} 60%
    );
  border-top: 1px solid ${p => p.theme.colors.border};
  padding: 0.85rem 1.1rem 0.95rem;
  color: ${p => p.theme.colors.text};
  z-index: 4;
  pointer-events: none;          /* never blocks viewport interaction */
  opacity: ${p => (p.$visible ? 1 : 0)};
  transform: translateY(${p => (p.$visible ? '0' : '4px')});
  transition: opacity 180ms ease, transform 180ms ease;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.9rem;
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
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  max-width: 240px;
`;

const Title = styled.div`
  font-size: 0.9rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  letter-spacing: 0.01em;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Subtitle = styled.div`
  font-size: 0.6rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const StatusPill = styled.span<{ $color: string }>`
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  background: ${p => p.$color}cc;
  color: white;
`;

// Vertical hairline divider between the title block and the param chips.
const Divider = styled.div`
  flex-shrink: 0;
  width: 1px;
  align-self: stretch;
  background: ${p => p.theme.colors.border};
  margin: 4px 0;
`;

const Chips = styled.div`
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.9rem;
  min-width: 0;
  max-height: 56px;
  overflow: hidden;
`;

const Chip = styled.div<{ $wide?: boolean }>`
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.74rem;
  line-height: 1.2;
  min-width: 0;
  max-width: ${p => (p.$wide ? '420px' : '180px')};
`;

const ChipLabel = styled.span`
  font-size: 0.58rem;
  font-weight: 700;
  color: ${p => p.theme.colors.textMuted};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  flex-shrink: 0;
`;

const ChipValue = styled.span<{ $mono?: boolean }>`
  font-weight: 500;
  color: ${p => p.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: ${p =>
    p.$mono
      ? `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      : 'inherit'};
`;

// ── Component ────────────────────────────────────────────────────────────────

export const DetailOverlay: React.FC<DetailOverlayProps> = ({
  title,
  subtitle,
  status,
  fields,
  visible,
  thumbUrl,
}) => {
  return (
    <Strip $visible={visible} role="status" aria-live="polite">
      <Row>
        {thumbUrl && <Thumb src={thumbUrl} alt="" />}
        <TitleCol>
          <Title title={title}>{title}</Title>
          {(subtitle || status) && (
            <Row style={{ gap: 6 }}>
              {subtitle && <Subtitle>{subtitle}</Subtitle>}
              {status && <StatusPill $color={status.color}>{status.label}</StatusPill>}
            </Row>
          )}
        </TitleCol>
        <Divider />
        <Chips>
          {fields.map((f, i) => (
            <Chip key={i} $wide={f.wide}>
              <ChipLabel>{f.label}</ChipLabel>
              <ChipValue
                $mono={f.mono}
                title={typeof f.value === 'string' ? f.value : undefined}
              >
                {f.value ?? <span style={{ opacity: 0.4 }}>—</span>}
              </ChipValue>
            </Chip>
          ))}
        </Chips>
      </Row>
    </Strip>
  );
};
