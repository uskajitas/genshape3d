// ─────────────────────────────────────────────────────────────────────────────
// ConfirmModal — a reusable, themed confirmation dialog.
//
// Imperative API:
//   const ok = await confirm({ title: 'Delete this?', variant: 'danger' });
//   if (ok) { ... }
//
// Setup: mount <ConfirmHost /> once at the app root (App.tsx). After that,
// any code anywhere can call `confirm()` and it returns Promise<boolean>.
//
// Why imperative: replacing `window.confirm()` is the main use case, and
// `await confirm(...)` reads exactly the same way without juggling state.
//
// Features:
//   - Portal to document.body (escapes overflow:hidden ancestors).
//   - Backdrop blur + click-to-dismiss (resolves false).
//   - Esc → cancel, Enter → confirm.
//   - Auto-focuses the confirm button (Enter works straight away).
//   - Scale-in / fade-in animations.
//   - Variant: 'default' (violet) | 'danger' (red). Drives icon + button tint.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { IconAlertTriangle, IconInfo, IconClose } from './Icons';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

// ── Imperative bridge ────────────────────────────────────────────────────────
// One pending request at a time. The host re-renders when this changes.

let pending: { opts: ConfirmOptions; resolve: (v: boolean) => void } | null = null;
let listener: (() => void) | null = null;

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  // If something else is already showing, resolve it as cancelled first so
  // we don't strand its promise.
  if (pending) {
    pending.resolve(false);
    pending = null;
  }
  return new Promise<boolean>((resolve) => {
    pending = { opts, resolve };
    listener?.();
  });
}

// ── Styles ───────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.94) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
`;

const Backdrop = styled.div`
  position: fixed; inset: 0;
  z-index: 9998;
  background: rgba(8, 6, 16, 0.65);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  animation: ${fadeIn} 0.18s ease-out;
`;

const Panel = styled.div<{ $variant: 'default' | 'danger' }>`
  position: relative;
  width: 100%;
  max-width: 420px;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 16px;
  box-shadow:
    0 24px 60px rgba(0,0,0,0.55),
    0 4px 16px rgba(0,0,0,0.35),
    0 0 0 1px rgba(255,255,255,0.03) inset;
  padding: 1.5rem 1.5rem 1.25rem;
  color: ${p => p.theme.colors.text};
  animation: ${scaleIn} 0.2s cubic-bezier(0.2, 0.8, 0.3, 1);
  /* Subtle accent stripe along the top edge */
  &::before {
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    border-radius: 16px 16px 0 0;
    background: ${p => p.$variant === 'danger'
      ? `linear-gradient(90deg, transparent, #EF4444, transparent)`
      : `linear-gradient(90deg, transparent, ${p.theme.colors.violet}, transparent)`};
    opacity: 0.7;
  }
`;

const Head = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  margin-bottom: 0.85rem;
`;

const IconBubble = styled.div<{ $variant: 'default' | 'danger' }>`
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${p => p.$variant === 'danger'
    ? 'rgba(239, 68, 68, 0.14)'
    : `${p.theme.colors.violet}22`};
  color: ${p => p.$variant === 'danger' ? '#EF4444' : p.theme.colors.violet};
  border: 1px solid ${p => p.$variant === 'danger'
    ? 'rgba(239, 68, 68, 0.32)'
    : `${p.theme.colors.violet}55`};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  letter-spacing: 0.01em;
  line-height: 1.4;
`;

const Message = styled.p`
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
  line-height: 1.55;
  color: ${p => p.theme.colors.textMuted};
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 12px; right: 12px;
  width: 28px; height: 28px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  & > svg { display: block; }
  transition: background 0.12s, color 0.12s, border-color 0.12s;
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

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  margin-top: 1.25rem;
`;

const BtnBase = styled.button`
  padding: 0.55rem 1.05rem;
  border-radius: 9px;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s, transform 0.08s, box-shadow 0.12s;
  &:active { transform: translateY(1px); }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

const CancelBtn = styled(BtnBase)`
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  border: 1px solid ${p => p.theme.colors.border};
  &:hover {
    color: ${p => p.theme.colors.text};
    border-color: ${p => p.theme.colors.borderHigh};
    background: ${p => p.theme.colors.surfaceHigh};
  }
`;

const ConfirmBtn = styled(BtnBase)<{ $variant: 'default' | 'danger' }>`
  border: 0;
  color: white;
  background: ${p => p.$variant === 'danger'
    ? 'linear-gradient(135deg, #EF4444, #DC2626)'
    : `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`};
  box-shadow: ${p => p.$variant === 'danger'
    ? '0 6px 18px rgba(239,68,68,0.45)'
    : `0 6px 18px ${p.theme.colors.violet}55`};
  &:hover { filter: brightness(1.08); }
`;

// ── Component ────────────────────────────────────────────────────────────────

const ConfirmModalInner: React.FC<{
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}> = ({ opts, resolve }) => {
  const variant = opts.variant ?? 'default';
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the confirm button so Enter works immediately.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  // Esc → cancel, Enter → confirm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolve(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resolve]);

  const onBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) resolve(false);
  }, [resolve]);

  return (
    <Backdrop onMouseDown={onBackdropClick}>
      <Panel
        $variant={variant}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <CloseBtn type="button" onClick={() => resolve(false)} aria-label="Close">
          <IconClose size={14} />
        </CloseBtn>

        <Head>
          <IconBubble $variant={variant}>
            {variant === 'danger' ? <IconAlertTriangle size={20} /> : <IconInfo size={20} />}
          </IconBubble>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title id="confirm-title">{opts.title}</Title>
            {opts.message && <Message>{opts.message}</Message>}
          </div>
        </Head>

        <Actions>
          <CancelBtn type="button" onClick={() => resolve(false)}>
            {opts.cancelLabel ?? 'Cancel'}
          </CancelBtn>
          <ConfirmBtn
            ref={confirmRef}
            type="button"
            $variant={variant}
            onClick={() => resolve(true)}
          >
            {opts.confirmLabel ?? (variant === 'danger' ? 'Delete' : 'Confirm')}
          </ConfirmBtn>
        </Actions>
      </Panel>
    </Backdrop>
  );
};

export const ConfirmHost: React.FC = () => {
  const [, setTick] = useState(0);

  useEffect(() => {
    listener = () => setTick(t => t + 1);
    return () => { listener = null; };
  }, []);

  if (!pending) return null;

  const { opts, resolve: rawResolve } = pending;
  const resolve = (v: boolean) => {
    rawResolve(v);
    pending = null;
    setTick(t => t + 1);
  };

  return ReactDOM.createPortal(
    <ConfirmModalInner opts={opts} resolve={resolve} />,
    document.body,
  );
};
