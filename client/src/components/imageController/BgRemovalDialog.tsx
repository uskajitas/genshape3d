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
  /** Asset id + user email — used to call the live-preview endpoint as
   *  the user moves sliders, before they hit Apply. When either is
   *  missing, the preview falls back to showing the original image. */
  assetId?: string;
  email?: string;
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

// Centered loading overlay covering the preview area. Drops a soft
// scrim + a spinner + a label so the user has unambiguous feedback
// that something is happening — even for sub-second operations.
// Pointer-events stay disabled (sliders on the right remain interactive).
const PreviewLoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background:
    radial-gradient(
      ellipse 70% 70% at 50% 50%,
      ${p => p.theme.colors.violet}1f,
      transparent 70%
    ),
    rgba(8, 6, 16, 0.5);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  pointer-events: none;
  z-index: 4;
  animation: fadeInOverlay 140ms ease-out;
  @keyframes fadeInOverlay {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

const SpinnerRing = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid ${p => p.theme.colors.borderHigh};
  border-top-color: ${p => p.theme.colors.violet};
  animation: spinRing 0.85s linear infinite;
  @keyframes spinRing {
    to { transform: rotate(360deg); }
  }
`;

const SpinnerLabel = styled.div`
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${p => p.theme.colors.text};
  animation: pulseLabel 1.6s ease-in-out infinite;
  @keyframes pulseLabel {
    0%, 100% { opacity: 0.85; }
    50%      { opacity: 1;    }
  }
`;

const PreviewErrorTag = styled.div`
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #f87171;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  backdrop-filter: blur(6px);
  pointer-events: none;
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

// Backgrounds for the cutout. The first 4 are normal output choices.
// The "test" group at the bottom is for INSPECTION only — bright,
// unnatural chroma colours that make any leftover pixel-level holes,
// fringes, or partial transparency in the silhouette pop out
// immediately. The user picks one of these while tweaking the
// threshold / erode sliders, then switches to Transparent (or
// whichever real bg) before clicking Apply.
const FILL_PRESETS: Array<{
  id: string;
  label: string;
  color: string | undefined;
  checker?: boolean;
  group?: 'output' | 'test';
}> = [
  { id: 'transparent', label: 'Transparent', color: undefined, checker: true, group: 'output' },
  { id: 'white',       label: 'White',       color: '#ffffff',                group: 'output' },
  { id: 'grey',        label: 'Grey',        color: '#7f7f7f',                group: 'output' },
  { id: 'black',       label: 'Black',       color: '#000000',                group: 'output' },
  // Chroma-key colours — strong visual contrast vs typical subjects, so
  // any sub-pixel hole in the silhouette is unmissable. Hollywood
  // green-screen green (~#00b140), cinema cyan, and magenta cover the
  // common bases.
  { id: 'chroma-green', label: 'Chroma green', color: '#00b140',              group: 'test' },
  { id: 'cyan',         label: 'Cyan',          color: '#00ffff',             group: 'test' },
  { id: 'magenta',      label: 'Magenta',       color: '#ff00ff',             group: 'test' },
];

// Hex → [r, g, b]. Used both for the preview request and the apply
// request so the server gets the same fill colour the user is seeing.
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export const BgRemovalDialog: React.FC<Props> = ({
  open, imageUrl, assetId, email, hasEdit, busy, onApply, onRevert, onClose,
}) => {
  const [threshold, setThreshold] = useState(200);
  const [erode, setErode] = useState(1);
  const [fillId, setFillId] = useState<string>('transparent');

  // Live-preview state. previewUrl is a blob: URL the <img> renders
  // when present; falls back to the original imageUrl. previewLoading
  // is shown as a faint overlay while a request is in flight.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Reset to defaults each time the dialog opens fresh, and clear any
  // stale preview from a previous opening (different asset).
  useEffect(() => {
    if (open) {
      setThreshold(200);
      setErode(1);
      setFillId('transparent');
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewError(null);
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

  // Live preview — debounce slider changes by 280ms, then fetch the
  // server-rendered cutout for the current params. The first call
  // takes ~2-3s (rembg cold). Subsequent calls (slider tweaks) are
  // ~50-150ms because the server caches the rembg result per asset.
  useEffect(() => {
    if (!open || !assetId || !email) return;
    let cancelled = false;
    let abort: AbortController | null = null;
    const handle = window.setTimeout(async () => {
      if (cancelled) return;
      const fill = FILL_PRESETS.find(p => p.id === fillId);
      const fillRgb = fill?.color ? hexToRgb(fill.color) : undefined;
      abort = new AbortController();
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const r = await fetch(`/api/text2image/assets/${assetId}/preview-bg`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            alphaThreshold: threshold,
            erodePx: erode,
            fillRgb,
          }),
          signal: abort.signal,
        });
        if (cancelled) return;
        if (!r.ok) {
          setPreviewError(`Preview failed (${r.status})`);
          return;
        }
        const blob = await r.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (!cancelled) setPreviewError(e?.message || 'Preview failed');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
      abort?.abort();
    };
  }, [open, assetId, email, threshold, erode, fillId]);

  // Free the last preview blob URL on unmount.
  useEffect(() => () => {
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

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
          <PreviewWrap aria-label="Live preview of the background-removal result">
            {(previewUrl || imageUrl) ? (
              <>
                <PreviewImg src={previewUrl || imageUrl} alt="" />
                <PreviewBadge>{previewUrl ? 'Preview' : 'Original'}</PreviewBadge>
                {(previewLoading || busy) && (
                  <PreviewLoadingOverlay role="status" aria-live="polite">
                    <SpinnerRing />
                    <SpinnerLabel>
                      {busy
                        ? (hasEdit ? 'Applying…' : 'Saving…')
                        : 'Computing preview…'}
                    </SpinnerLabel>
                  </PreviewLoadingOverlay>
                )}
                {!previewLoading && !busy && previewError && (
                  <PreviewErrorTag>{previewError}</PreviewErrorTag>
                )}
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
                {FILL_PRESETS.filter(p => p.group !== 'test').map(p => (
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

            <Field>
              <FieldHeader>
                <FieldLabel>Test colours</FieldLabel>
                <FieldHint style={{ margin: 0 }}>preview only</FieldHint>
              </FieldHeader>
              <Swatches>
                {FILL_PRESETS.filter(p => p.group === 'test').map(p => (
                  <Swatch
                    key={p.id}
                    type="button"
                    $active={fillId === p.id}
                    $bg="transparent"
                    disabled={busy}
                    onClick={() => setFillId(p.id)}
                  >
                    <SwatchDot $color={p.color || '#000'} />
                    {p.label}
                  </Swatch>
                ))}
              </Swatches>
              <FieldHint>
                Bright fills make leftover holes / soft edges in the cutout
                obvious. Switch back to a real background before applying.
              </FieldHint>
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
