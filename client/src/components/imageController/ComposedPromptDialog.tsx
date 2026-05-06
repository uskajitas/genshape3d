// ─────────────────────────────────────────────────────────────────────────────
// ComposedPromptDialog — small portalled modal that shows the full composed
// prompt as selectable text, plus a one-click "Copy" button.
//
// Why a modal instead of the Tooltip we use everywhere else: tooltips
// dismiss on mouseleave, which breaks "select a chunk and Ctrl+C" — the
// most common reason users want to read the composed prompt in the first
// place. The dialog stays open until the user dismisses it (Esc, ×,
// backdrop click).
//
// This is intentionally NOT the ConfirmModal — that one is built for
// confirm/cancel decisions. This one is read-only with a single close
// affordance and a copy helper.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { IconClose } from '../Icons';

interface Props {
  open: boolean;
  text: string;
  onClose: () => void;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;
const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
`;

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

const Panel = styled.div`
  position: relative;
  width: 100%;
  max-width: 560px;
  max-height: calc(100vh - 4rem);
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
  /* Subtle accent stripe along the top edge. */
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

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.95rem 1.05rem 0.6rem;
`;

const Title = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.violet};
`;

const Subtitle = styled.div`
  font-size: 0.7rem;
  color: ${p => p.theme.colors.textMuted};
  margin-top: 2px;
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
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
  & > svg { display: block; }
  &:hover {
    background: ${p => p.theme.colors.surfaceHigh};
    color: ${p => p.theme.colors.text};
    border-color: ${p => p.theme.colors.border};
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

const Body = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  padding: 0.4rem 1.05rem 0.85rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.55;
  color: ${p => p.theme.colors.text};
  white-space: pre-wrap;
  word-break: break-word;
  /* The text inside MUST be user-selectable — that's the whole point of
     this modal. */
  user-select: text;
  cursor: text;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    background: ${p => p.theme.colors.borderHigh};
    border-radius: 3px;
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
  padding: 0.75rem 1.05rem 0.95rem;
  border-top: 1px solid ${p => p.theme.colors.border};
`;

const PillBtn = styled.button<{ $primary?: boolean }>`
  padding: 0.45rem 0.95rem;
  border-radius: 999px;
  border: ${p => (p.$primary ? '0' : `1px solid ${p.theme.colors.border}`)};
  background: ${p => (p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : p.theme.colors.surfaceHigh)};
  color: ${p => (p.$primary ? '#fff' : p.theme.colors.text)};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: filter 160ms ease, background 160ms ease, border-color 160ms ease;
  &:hover {
    ${p => p.$primary
      ? 'filter: brightness(1.08);'
      : `background: ${p.theme.colors.surface}; border-color: ${p.theme.colors.borderHigh};`}
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

const CopiedTag = styled.span`
  font-size: 0.66rem;
  font-weight: 600;
  color: ${p => p.theme.colors.violet};
  margin-right: 0.4rem;
`;

// ── Component ────────────────────────────────────────────────────────────────

export const ComposedPromptDialog: React.FC<Props> = ({ open, text, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Reset the "copied" tag whenever the dialog opens fresh.
  useEffect(() => {
    if (open) setCopied(false);
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

  const onBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Quick fade — so the affordance is visible but not in the way if
      // the user wants to copy a different chunk afterwards.
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can be blocked (insecure context, denied permission).
      // Falling through is fine — the text is selectable, the user can
      // still Ctrl+C manually.
    }
  }, [text]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <Backdrop onMouseDown={onBackdropClick}>
      <Panel role="dialog" aria-modal="true" aria-labelledby="composed-prompt-title">
        <Head>
          <div>
            <Title id="composed-prompt-title">Composed prompt</Title>
            <Subtitle>Select any part to copy</Subtitle>
          </div>
          <CloseBtn type="button" onClick={onClose} aria-label="Close">
            <IconClose size={14} />
          </CloseBtn>
        </Head>
        <Body>{text}</Body>
        <Footer>
          {copied && <CopiedTag>Copied!</CopiedTag>}
          <PillBtn type="button" onClick={onCopy}>Copy all</PillBtn>
          <PillBtn type="button" $primary onClick={onClose}>Close</PillBtn>
        </Footer>
      </Panel>
    </Backdrop>,
    document.body,
  );
};
