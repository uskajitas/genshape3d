// ─────────────────────────────────────────────────────────────────────────────
// BgRemovalDialog — modal for the "Edit background" tool.
//
// User picks:
//   • Alpha threshold (1–254): how aggressive the cutoff is.
//   • Erosion (0–8 px):        how much to shrink the silhouette after threshold.
//   • Output background:       Transparent / White / Grey / Black / Custom.
//
// Click APPLY → modal closes, parent calls server, main image updates
// when the asset row's image_key flips. Click REVERT (only when an
// edit is already applied) → restores the original.
//
// The original image is never lost — server keeps it under
// originalImageKey so re-edits always start from scratch.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { IconClose } from '../Icons';

export interface BgRemovalParams {
  alphaThreshold: number;
  erodePx: number;
  /** undefined = transparent. Otherwise hex string like '#ffffff'. */
  fillColor?: string;
}

interface Props {
  open: boolean;
  /** Visual reference image — what the user is editing. Should be the
   *  ORIGINAL (pre-edit) so each adjustment makes sense relative to a
   *  stable input. Caller provides the URL (typically the asset's
   *  originalImageKey when set, otherwise the current imageKey). */
  imageUrl?: string;
  /** True when there's an originalImageKey to revert to. */
  hasEdit: boolean;
  busy?: boolean;
  onApply: (params: BgRemovalParams) => void;
  onRevert: () => void;
  onClose: () => void;
}

// ── Animations ───────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;
const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
`;

// ── Styles ───────────────────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed; inset: 0;
  z-index: 9998;
  background: rgba(8, 6, 16, 0.6);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: ${fadeIn} 160ms ease-out;
`;

// Big modal — sized to roughly match the main viewport image so the user
// gets a real working surface for adjustments, not a cramped preview.
const Panel = styled.div`
  position: relative;
  width: 100%;
  /* Cap at 1080px / 90% of viewport so it looks comfortable on any
     screen but doesn't get absurd on ultrawides. */
  max-width: min(1080px, 92vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 14px;
  box-shadow:
    0 20px 60px rgba(0,0,0,0.55),
    0 4px 14px rgba(0,0,0,0.3),
    0 0 0 1px rgba(255,255,255,0.03) inset;
  animation: ${scaleIn} 180ms cubic-bezier(0.2, 0.8, 0.3, 1);
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    border-radius: 14px 14px 0 0;
    background: linear-gradient(
      90deg,
      transparent,
      ${p => p.theme.colors.violet},
      transparent
    );
    opacity: 0.7;
  }
`;

// Visual reference of what the user is editing. Takes the lion's share
// of the modal's horizontal space (column-left) so the user actually
// sees what they're working with — the controls on the right are
// secondary. Checker background makes transparency visible (relevant
// once we add live result preview).
const PreviewWrap = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 10px;
  border: 1px solid ${p => p.theme.colors.border};
  background:
    repeating-conic-gradient(#1d1d22 0deg 90deg, #2a2a30 90deg 180deg) 0/14px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const PreviewImg = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
`;

const PreviewEmpty = styled.div`
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
`;

const PreviewBadge = styled.div`
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(8, 6, 16, 0.65);
  color: ${p => p.theme.colors.textMuted};
  backdrop-filter: blur(6px);
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 0.95rem 1.05rem 0.5rem;
`;

const TitleCol = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Title = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.violet};
`;

const Subtitle = styled.div`
  font-size: 0.74rem;
  color: ${p => p.theme.colors.textMuted};
`;

const CloseBtn = styled.button`
  width: 28px; height: 28px;
  padding: 0; margin: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  transition: background 140ms ease, color 140ms ease;
  & > svg { display: block; }
  &:hover {
    background: ${p => p.theme.colors.surfaceHigh};
    color: ${p => p.theme.colors.text};
  }
`;

// Body is a 2-column row: preview on the left (takes most space), the
// controls column on the right (fixed-ish width). Wraps to a stacked
// column on narrow screens.
const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  gap: 1rem;
  padding: 0.6rem 1.05rem 1rem;
  @media (max-width: 720px) {
    flex-direction: column;
  }
`;

// Sliders + swatches column — sits to the right of the big preview.
const Controls = styled.div`
  flex: 0 0 280px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  @media (max-width: 720px) {
    flex: 1 1 auto;
    overflow-y: visible;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
`;

const FieldHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
`;

const FieldLabel = styled.div`
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
`;

const FieldValue = styled.div`
  font-size: 0.78rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text};
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
`;

const FieldHint = styled.div`
  font-size: 0.66rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.4;
`;

const Slider = styled.input`
  width: 100%;
  margin: 0;
`;

const Swatches = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Swatch = styled.button<{ $active?: boolean; $bg: string; $border?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1.5px solid ${p => (p.$active ? p.theme.colors.violet : (p.$border || p.theme.colors.border))};
  background: ${p => p.$bg};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: border-color 140ms ease, transform 100ms ease;
  &:hover { border-color: ${p => p.theme.colors.violet}; }
  &:active { transform: translateY(1px); }
`;

const SwatchDot = styled.span<{ $color: string; $checker?: boolean }>`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => (p.$checker
    ? `repeating-conic-gradient(#444 0deg 90deg, #888 90deg 180deg) 0/8px 8px`
    : p.$color)};
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  padding: 0.75rem 1.05rem 0.95rem;
  border-top: 1px solid ${p => p.theme.colors.border};
`;

const FooterLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
`;

const FooterRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
`;

const PillBtn = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  padding: 0.45rem 1.05rem;
  border-radius: 999px;
  border: ${p => (p.$primary ? '0' : `1px solid ${p.theme.colors.border}`)};
  background: ${p => (p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : p.theme.colors.surfaceHigh)};
  color: ${p => (p.$primary ? '#fff' : (p.$danger ? '#EF4444' : p.theme.colors.text))};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: filter 160ms ease, background 160ms ease, border-color 160ms ease;
  &:hover:not(:disabled) {
    ${p => p.$primary
      ? 'filter: brightness(1.08);'
      : `background: ${p.theme.colors.surface}; border-color: ${p.theme.colors.borderHigh};`}
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// ── Component ────────────────────────────────────────────────────────────────

const FILL_PRESETS: Array<{ id: string; label: string; color: string | undefined; checker?: boolean }> = [
  { id: 'transparent', label: 'Transparent', color: undefined, checker: true },
  { id: 'white',       label: 'White',       color: '#ffffff' },
  { id: 'grey',        label: 'Grey',        color: '#7f7f7f' },
  { id: 'black',       label: 'Black',       color: '#000000' },
];

export const BgRemovalDialog: React.FC<Props> = ({
  open, imageUrl, hasEdit, busy, onApply, onRevert, onClose,
}) => {
  const [threshold, setThreshold] = useState(200);
  const [erode, setErode] = useState(1);
  const [fillId, setFillId] = useState<string>('transparent');

  // Reset to defaults each time the dialog opens fresh.
  useEffect(() => {
    if (open) {
      setThreshold(200);
      setErode(1);
      setFillId('transparent');
    }
  }, [open]);

  // Esc closes the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !busy) onClose();
  };

  const apply = () => {
    const fill = FILL_PRESETS.find(p => p.id === fillId);
    onApply({
      alphaThreshold: threshold,
      erodePx: erode,
      fillColor: fill?.color,
    });
  };

  if (!open) return null;

  return ReactDOM.createPortal(
    <Backdrop onMouseDown={onBackdropClick}>
      <Panel role="dialog" aria-modal="true" aria-labelledby="bg-removal-title">
        <Head>
          <TitleCol>
            <Title id="bg-removal-title">Edit background</Title>
            <Subtitle>Cutout the subject and pick a background.</Subtitle>
          </TitleCol>
          <CloseBtn type="button" onClick={onClose} aria-label="Close" disabled={busy}>
            <IconClose size={14} />
          </CloseBtn>
        </Head>

        <Body>
          <PreviewWrap aria-label="Image being edited">
            {imageUrl ? (
              <>
                <PreviewImg src={imageUrl} alt="" />
                <PreviewBadge>Original</PreviewBadge>
              </>
            ) : (
              <PreviewEmpty>No preview available</PreviewEmpty>
            )}
          </PreviewWrap>

          <Controls>
            <Field>
              <FieldHeader>
                <FieldLabel>Alpha threshold</FieldLabel>
                <FieldValue>{threshold}</FieldValue>
              </FieldHeader>
              <Slider
                type="range"
                min={50}
                max={250}
                step={1}
                value={threshold}
                disabled={busy}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
              <FieldHint>
                Higher values = stricter cutout. Default 200 works for most images.
              </FieldHint>
            </Field>

            <Field>
              <FieldHeader>
                <FieldLabel>Edge shrink</FieldLabel>
                <FieldValue>{erode} px</FieldValue>
              </FieldHeader>
              <Slider
                type="range"
                min={0}
                max={8}
                step={1}
                value={erode}
                disabled={busy}
                onChange={(e) => setErode(Number(e.target.value))}
              />
              <FieldHint>
                Pulls the silhouette inward — removes fringe artefacts at the
                cost of a slightly tighter outline.
              </FieldHint>
            </Field>

            <Field>
              <FieldLabel>Background</FieldLabel>
              <Swatches>
                {FILL_PRESETS.map(p => (
                  <Swatch
                    key={p.id}
                    type="button"
                    $active={fillId === p.id}
                    $bg="transparent"
                    disabled={busy}
                    onClick={() => setFillId(p.id)}
                  >
                    <SwatchDot $color={p.color || '#000'} $checker={p.checker} />
                    {p.label}
                  </Swatch>
                ))}
              </Swatches>
            </Field>
          </Controls>
        </Body>

        <Footer>
          <FooterLeft>
            {hasEdit && (
              <PillBtn type="button" $danger disabled={busy} onClick={onRevert}>
                ↶ Revert to original
              </PillBtn>
            )}
          </FooterLeft>
          <FooterRight>
            <PillBtn type="button" disabled={busy} onClick={onClose}>Cancel</PillBtn>
            <PillBtn type="button" $primary disabled={busy} onClick={apply}>
              {busy ? 'Applying…' : 'Apply'}
            </PillBtn>
          </FooterRight>
        </Footer>
      </Panel>
    </Backdrop>,
    document.body,
  );
};
