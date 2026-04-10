import React, { useState, useRef, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';

const slideDown = keyframes`
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Trigger = styled.button<{ $open: boolean; $disabled?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: ${p => p.theme.colors.background};
  border: 1px solid ${p => p.$open ? p.theme.colors.primary : p.theme.colors.border};
  border-radius: 8px;
  color: ${p => p.$disabled ? p.theme.colors.textMuted : p.theme.colors.text};
  font-size: 0.8rem;
  font-weight: 500;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  opacity: ${p => p.$disabled ? 0.5 : 1};
  ${p => p.$open && css`
    box-shadow: 0 0 0 3px ${p.theme.colors.primary}22;
  `}
  &:hover:not(:disabled) {
    border-color: ${p => p.theme.colors.primary};
  }
`;

const Chevron = styled.span<{ $open: boolean }>`
  font-size: 0.6rem;
  color: ${p => p.theme.colors.textMuted};
  transition: transform 0.2s ease;
  transform: ${p => p.$open ? 'rotate(180deg)' : 'rotate(0deg)'};
  display: inline-block;
`;

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  overflow: hidden;
  z-index: 200;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${p => p.theme.colors.primary}22;
  animation: ${slideDown} 0.15s ease;
`;

const Option = styled.button<{ $active: boolean }>`
  width: 100%;
  text-align: left;
  padding: 0.55rem 0.75rem;
  font-size: 0.8rem;
  font-weight: ${p => p.$active ? 600 : 400};
  background: ${p => p.$active ? p.theme.colors.primary + '22' : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.primary : p.theme.colors.text};
  border: none;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  &:hover {
    background: ${p => p.theme.colors.surfaceHigh};
    color: ${p => p.theme.colors.text};
  }
`;

const Check = styled.span`
  font-size: 0.7rem;
  color: ${p => p.theme.colors.primary};
`;

const Wrap = styled.div`
  position: relative;
`;

interface DropdownProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  disabled?: boolean;
}

const Dropdown: React.FC<DropdownProps> = ({ value, options, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <Wrap ref={ref}>
      <Trigger
        type="button"
        $open={open}
        $disabled={disabled}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
      >
        <span>{value}</span>
        <Chevron $open={open}>▼</Chevron>
      </Trigger>
      {open && (
        <Menu>
          {options.map(opt => (
            <Option
              key={opt}
              $active={opt === value}
              onClick={() => { onChange(opt); setOpen(false); }}
            >
              {opt}
              {opt === value && <Check>✓</Check>}
            </Option>
          ))}
        </Menu>
      )}
    </Wrap>
  );
};

export default Dropdown;
