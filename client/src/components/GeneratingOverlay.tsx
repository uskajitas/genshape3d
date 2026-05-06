// ─────────────────────────────────────────────────────────────────────────────
// GeneratingOverlay — semi-transparent overlay placed inside a panel that
// owns a generation flow (TextToImage's prompt panel, Workspace's
// upload / params panel). Visually freezes the panel during generation
// so the user can't kick off a second one or change params mid-flight,
// while the rest of the page stays interactive.
//
// Render INSIDE a `position: relative` ancestor — the overlay is absolute
// and fills its parent.
//
// Props:
//   visible       — show / hide
//   message       — primary line, e.g. "Generating image…"
//   detail        — optional sub-line under the message (smaller, muted)
//   progressPct   — when present, a slim progress bar appears (0..100)
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled, { keyframes } from 'styled-components';

interface Props {
  visible: boolean;
  message?: string;
  detail?: string;
  progressPct?: number;
}

// ── Animations ───────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 1; }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

// ── Styles ───────────────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  padding: 1.5rem;
  background:
    radial-gradient(
      ellipse 80% 80% at 50% 50%,
      ${p => p.theme.colors.violet}1a,
      transparent 70%
    ),
    rgba(8, 6, 16, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  /* Catch all pointer events so the panel underneath can't be interacted
     with while generating. */
  pointer-events: auto;
  animation: ${fadeIn} 220ms ease-out;
  /* Inherit the parent's rounded corners if any so the overlay doesn't
     paint outside its container. */
  border-radius: inherit;
`;

const Spinner = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid ${p => p.theme.colors.borderHigh};
  border-top-color: ${p => p.theme.colors.violet};
  animation: ${spin} 0.85s linear infinite;
`;

const Message = styled.div`
  font-size: 0.92rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  letter-spacing: 0.01em;
  text-align: center;
  animation: ${pulse} 1.6s ease-in-out infinite;
`;

const Detail = styled.div`
  font-size: 0.74rem;
  color: ${p => p.theme.colors.textMuted};
  text-align: center;
  max-width: 320px;
  line-height: 1.4;
`;

const Progress = styled.div`
  width: 200px;
  height: 4px;
  border-radius: 999px;
  background: ${p => p.theme.colors.surfaceHigh};
  overflow: hidden;
  position: relative;
`;

const ProgressFill = styled.div<{ $pct: number }>`
  position: absolute;
  inset: 0;
  width: ${p => Math.min(100, Math.max(0, p.$pct))}%;
  background: linear-gradient(
    90deg,
    ${p => p.theme.colors.primary},
    ${p => p.theme.colors.violet}
  );
  transition: width 220ms ease;
`;

const PctText = styled.div`
  font-size: 0.7rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  letter-spacing: 0.04em;
`;

// ── Component ────────────────────────────────────────────────────────────────

export const GeneratingOverlay: React.FC<Props> = ({
  visible,
  message,
  detail,
  progressPct,
}) => {
  if (!visible) return null;
  const showProgress = typeof progressPct === 'number';
  return (
    <Overlay role="status" aria-live="polite">
      <Spinner aria-hidden />
      <Message>{message || 'Generating…'}</Message>
      {showProgress && (
        <>
          <Progress aria-label="Progress">
            <ProgressFill $pct={progressPct!} />
          </Progress>
          <PctText>{Math.round(progressPct!)}%</PctText>
        </>
      )}
      {detail && <Detail>{detail}</Detail>}
    </Overlay>
  );
};
