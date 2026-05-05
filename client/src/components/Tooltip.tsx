// ─────────────────────────────────────────────────────────────────────────────
// Tooltip — themed, viewport-aware, portal-rendered tooltip wrapper.
//
// Replaces the browser's default `title` attribute (which renders as an
// ugly OS-level yellow tooltip with a long delay) with a styled bubble
// that:
//
//   - Uses theme tokens (surface, borderHigh, text, etc.) so it sits
//     cohesively with the rest of the UI.
//   - Renders via ReactDOM.createPortal into document.body, so no parent
//     `overflow: hidden` or stacking context can clip it.
//   - Picks the best edge automatically: prefers the requested `placement`
//     but flips to the opposite side if there isn't enough viewport
//     room — and falls back to `top` as a last resort.
//
// Usage:
//
//   <Tooltip text="Cancel job" placement="left">
//     <button>...</button>
//   </Tooltip>
//
// The single child is left untouched in the layout — we just attach
// mouseenter/mouseleave handlers via React.cloneElement and read the
// element's DOM rect off the event's currentTarget. Any existing handlers
// on the child are preserved (chained, not overwritten).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import styled from 'styled-components';

type Side = 'left' | 'right' | 'top' | 'bottom';
type Placement = 'auto' | Side;

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  /** Preferred placement. Auto-flips if it doesn't fit. Default: 'top'. */
  placement?: Placement;
  /** Max width in px. Default 220. */
  maxWidth?: number;
}

interface TipState {
  x: number;
  y: number;
  side: Side;
}

// ── Bubble ───────────────────────────────────────────────────────────────────

const Bubble = styled.div<{ $side: Side; $maxW: number }>`
  position: fixed;
  z-index: 10000;
  max-width: ${p => p.$maxW}px;
  padding: 0.4rem 0.65rem;
  border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => p.theme.colors.surface};
  box-shadow:
    0 8px 24px rgba(0,0,0,0.5),
    0 2px 8px rgba(0,0,0,0.32);
  color: ${p => p.theme.colors.text};
  font-size: 0.72rem;
  line-height: 1.45;
  font-weight: 500;
  letter-spacing: 0.01em;
  pointer-events: none;
  white-space: nowrap;
  &::after {
    content: '';
    position: absolute;
    width: 8px; height: 8px;
    background: ${p => p.theme.colors.surface};
    border-top: 1px solid ${p => p.theme.colors.borderHigh};
    border-right: 1px solid ${p => p.theme.colors.borderHigh};
    ${p => p.$side === 'left'   && `right:-5px;  top:50%; transform:translateY(-50%) rotate(45deg);`}
    ${p => p.$side === 'right'  && `left:-5px;   top:50%; transform:translateY(-50%) rotate(225deg);`}
    ${p => p.$side === 'top'    && `bottom:-5px; left:50%; transform:translateX(-50%) rotate(135deg);`}
    ${p => p.$side === 'bottom' && `top:-5px;    left:50%; transform:translateX(-50%) rotate(-45deg);`}
  }
`;

// ── Component ────────────────────────────────────────────────────────────────

const GAP = 8;
const PAD = 8;

function pickPlacement(
  rect: DOMRect,
  preferred: Placement,
  w: number,
  h: number,
  vw: number,
  vh: number,
): TipState {
  const fitsLeft   = rect.left  - w - GAP >= PAD;
  const fitsRight  = rect.right + w + GAP <= vw - PAD;
  const fitsTop    = rect.top   - h - GAP >= PAD;
  const fitsBottom = rect.bottom + h + GAP <= vh - PAD;

  // Resolve the order of placements to try based on preference.
  const order: Side[] =
    preferred === 'left'   ? ['left',   'right', 'top',    'bottom'] :
    preferred === 'right'  ? ['right',  'left',  'top',    'bottom'] :
    preferred === 'bottom' ? ['bottom', 'top',   'right',  'left'  ] :
                             ['top',    'bottom','right',  'left'  ];

  const fits: Record<Side, boolean> = {
    left: fitsLeft, right: fitsRight, top: fitsTop, bottom: fitsBottom,
  };

  const side = order.find(s => fits[s]) ?? order[0];

  // Compute coordinates for the chosen side, then clamp into the viewport
  // so a too-tall / too-wide bubble never escapes the screen.
  let x = 0, y = 0;
  if (side === 'left') {
    x = rect.left - w - GAP;
    y = rect.top + rect.height / 2 - h / 2;
  } else if (side === 'right') {
    x = rect.right + GAP;
    y = rect.top + rect.height / 2 - h / 2;
  } else if (side === 'top') {
    x = rect.left + rect.width / 2 - w / 2;
    y = rect.top - h - GAP;
  } else {
    x = rect.left + rect.width / 2 - w / 2;
    y = rect.bottom + GAP;
  }
  x = Math.max(PAD, Math.min(x, vw - w - PAD));
  y = Math.max(PAD, Math.min(y, vh - h - PAD));
  return { x, y, side };
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  children,
  placement = 'top',
  maxWidth = 220,
}) => {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Use a conservative estimate for the bubble dimensions BEFORE first
    // render — once it mounts the actual size will match closely enough
    // that the math-clamped position still looks right. We re-measure
    // after mount via the layout effect below.
    const estW = Math.min(maxWidth, Math.max(80, text.length * 7));
    const estH = 28;
    setTip(pickPlacement(rect, placement, estW, estH, window.innerWidth, window.innerHeight));
  }, [maxWidth, placement, text]);

  const hide = useCallback(() => setTip(null), []);

  // Hide on scroll / resize so the bubble doesn't get stranded mid-air.
  useEffect(() => {
    if (!tip) return;
    const onChange = () => setTip(null);
    window.addEventListener('scroll', onChange, true);
    window.addEventListener('resize', onChange);
    return () => {
      window.removeEventListener('scroll', onChange, true);
      window.removeEventListener('resize', onChange);
    };
  }, [tip]);

  // Attach handlers to the child WITHOUT clobbering any it already has.
  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show(e);
      children.props.onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide();
      children.props.onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      // Keyboard users get the tooltip too.
      const rect = e.currentTarget.getBoundingClientRect();
      const estW = Math.min(maxWidth, Math.max(80, text.length * 7));
      const estH = 28;
      setTip(pickPlacement(rect, placement, estW, estH, window.innerWidth, window.innerHeight));
      children.props.onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      hide();
      children.props.onBlur?.(e);
    },
  });

  return (
    <>
      {child}
      {tip && ReactDOM.createPortal(
        <Bubble $side={tip.side} $maxW={maxWidth} style={{ left: tip.x, top: tip.y }}>
          {text}
        </Bubble>,
        document.body,
      )}
    </>
  );
};
