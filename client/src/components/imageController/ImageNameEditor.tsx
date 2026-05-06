// ─────────────────────────────────────────────────────────────────────────────
// ImageNameEditor — click-to-edit name field.
//
// Shows the name as plain text; clicking switches to an <input>. Saves on
// Enter or blur. Esc cancels.
//
// No bells, no whistles — this is *just* the name editor. The parent owns
// the actual write (via onChange).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

interface Props {
  value: string;
  /** Called with the new value when the user commits (Enter or blur). */
  onChange: (next: string) => void;
}

const Wrap = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
`;

const Display = styled.button`
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  background: transparent;
  border: 0;
  padding: 2px 4px;
  border-radius: 6px;
  cursor: text;
  letter-spacing: 0.01em;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover {
    background: ${p => p.theme.colors.surfaceHigh};
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

const Input = styled.input`
  width: 100%;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  background: ${p => p.theme.colors.surfaceHigh};
  border: 1px solid ${p => p.theme.colors.violet};
  border-radius: 6px;
  padding: 2px 6px;
  letter-spacing: 0.01em;
  line-height: 1.2;
  outline: none;
  &:focus {
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

export const ImageNameEditor: React.FC<Props> = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep draft in sync if the upstream value changes while we're not editing
  // (e.g. user picked a different image).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Auto-focus + select-all when entering edit mode.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onChange(next);
    else setDraft(value); // revert empty / unchanged
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <Wrap>
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          }}
        />
      ) : (
        <Display
          type="button"
          onClick={() => setEditing(true)}
          title="Click to rename"
        >
          {value || 'Untitled'}
        </Display>
      )}
    </Wrap>
  );
};
