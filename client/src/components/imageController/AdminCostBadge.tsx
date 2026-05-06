// ─────────────────────────────────────────────────────────────────────────────
// AdminCostBadge — tiny gold pill that surfaces a per-action cost to the
// admin user only. NOT shown to regular users — they'll get a separate
// charging flow later (credits / billing).
//
// Use it as the trigger child of a Tooltip if you want the value visible
// only on hover, or render it inline next to a button as a permanent
// indicator. Currently used on the view-slot + and ↻ buttons.
//
// Visual: muted gold, low contrast — visible to a power user looking at
// it but doesn't shout for attention. Distinct from the violet/pink theme
// so admin-only metadata is unambiguous at a glance.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import styled from 'styled-components';

interface Props {
  /** Display string, e.g. "$0.05" or "≈$0.02". */
  cost: string;
  /** Optional tooltip-like hint shown after the cost. */
  note?: string;
}

const Pill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid #b88a30;             /* muted gold ring */
  background: rgba(184, 138, 48, 0.12);  /* warm gold tint */
  color: #e8c267;                         /* readable gold text */
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
  /* Sit above the slot's hover affordances so the admin can read the cost
     even when the regen / delete chips are visible. */
  z-index: 4;
`;

const Note = styled.span`
  font-weight: 500;
  opacity: 0.8;
`;

export const AdminCostBadge: React.FC<Props> = ({ cost, note }) => (
  <Pill aria-label={`Admin cost: ${cost}${note ? ` (${note})` : ''}`}>
    {cost}
    {note && <Note>· {note}</Note>}
  </Pill>
);
