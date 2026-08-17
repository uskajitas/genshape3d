// ─────────────────────────────────────────────────────────────────────────────
// AppRail — THE left icon rail, shared by every workspace page.
//
// There is exactly one definition of the pipeline and its labels:
//
//   ✨ Image     → text-to-image        (/dashboard/text)
//   ⬡  3D Model  → image/text-to-model  (/dashboard)
//   🎨 Texture   → texture a model      (/dashboard?tool=texture)
//   🎬 Scene     → scene composer       (/scenes)
//   🦴 Rig       → coming soon
//   📦 Assets    → coming soon
//   ── admin ──  Stats · Bench · Roadmap (+ host extras, e.g. Archive)
//
// Pages must NOT hand-roll their own rail with different labels/icons — that
// is exactly how "Image" ended up meaning text-to-image on one page and
// image-to-3D on another. Render <AppRail active=… /> instead. A host page
// can intercept a key it handles in-page (e.g. Workspace switching to its
// texture tool without a navigation) via onSelect returning true.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

export type RailKey =
  | 'image' | 'model' | 'texture' | 'scene' | 'rig' | 'assets'
  | 'stats' | 'bench' | 'roadmap';

const Rail = styled.aside`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0;
  gap: 0.4rem;
  border-right: 1px solid ${p => p.theme.colors.border};
  background:
    linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
`;

const RailItemButton = styled.button<{ $disabled?: boolean }>`
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
`;

const RailBtn = styled.span<{ $active?: boolean; $disabled?: boolean }>`
  width: 44px; height: 44px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$active ? 'white' : p.$disabled ? p.theme.colors.textMuted : p.theme.colors.text};
  opacity: ${p => p.$disabled ? 0.4 : 1};
  position: relative;
  transition: background 0.15s, color 0.15s, transform 0.12s;
  ${p => p.$active && `box-shadow: 0 4px 18px ${p.theme.colors.primary}66;`}
  ${RailItemButton}:hover & {
    ${p => !p.$disabled && !p.$active && `background: ${p.theme.colors.surfaceHigh};`}
    ${p => !p.$disabled && `transform: scale(1.04);`}
  }
`;

const RailLabel = styled.span`
  font-size: 0.6rem;
  color: ${p => p.theme.colors.textMuted};
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 0.1rem;
`;

export const RailDivider = styled.div`
  width: 24px;
  height: 1px;
  background: ${p => p.theme.colors.border};
  margin: 0.4rem 0;
`;

export const RailItem: React.FC<{
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}> = ({ icon, label, active, disabled, onClick, title }) => (
  <RailItemButton
    type="button"
    $disabled={disabled}
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
    title={title || label}
  >
    <RailBtn $active={active} $disabled={disabled}>{icon}</RailBtn>
    <RailLabel>{label}</RailLabel>
  </RailItemButton>
);

interface AppRailProps {
  /** Which pipeline step this page represents. */
  active: RailKey;
  isAdmin?: boolean;
  /** Host-page interception: return true if the key was handled in-page
   *  (no navigation). Return false/undefined to get default navigation. */
  onSelect?: (key: RailKey) => boolean | void;
  /** Extra admin-only items rendered after the standard admin group
   *  (e.g. Workspace's Archive toggle). */
  adminExtras?: React.ReactNode;
}

const NAV_TARGETS: Partial<Record<RailKey, string>> = {
  image: '/dashboard/text',
  model: '/dashboard',
  texture: '/dashboard?tool=texture',
  scene: '/scenes',
  stats: '/admin/stats',
  bench: '/benchmark',
  roadmap: '/admin/roadmap',
};

export const AppRail: React.FC<AppRailProps> = ({ active, isAdmin, onSelect, adminExtras }) => {
  const navigate = useNavigate();

  const go = (key: RailKey) => {
    if (key === active && !onSelect) return;
    if (onSelect && onSelect(key) === true) return;
    const target = NAV_TARGETS[key];
    if (target) navigate(target);
  };

  return (
    <Rail>
      <RailItem icon="✨" label="Image" title="Text to image" active={active === 'image'} onClick={() => go('image')} />
      <RailItem icon="⬡" label="3D Model" title="Image to 3D model" active={active === 'model'} onClick={() => go('model')} />
      <RailItem icon="🎨" label="Texture" title="Texture a finished model" active={active === 'texture'} onClick={() => go('texture')} />
      <RailItem icon="🎬" label="Scene" title="Compose a scene from your assets" active={active === 'scene'} onClick={() => go('scene')} />
      <RailItem icon="🦴" label="Rig" disabled title="Rig & animate — coming soon" />
      <RailItem icon="📦" label="Assets" disabled title="Asset library — coming soon" />
      {isAdmin && (
        <>
          <RailDivider />
          <RailItem icon="📊" label="Stats" title="Admin stats" active={active === 'stats'} onClick={() => go('stats')} />
          <RailItem icon="🧪" label="Bench" title="Benchmark runs" active={active === 'bench'} onClick={() => go('bench')} />
          <RailItem icon="🗺" label="Roadmap" title="GenShape3D roadmap" active={active === 'roadmap'} onClick={() => go('roadmap')} />
          {adminExtras}
        </>
      )}
    </Rail>
  );
};

export default AppRail;
