// ─────────────────────────────────────────────────────────────────────────────
// TextToImage — sibling page to Workspace (image-to-3D).
//
// Layout mirrors Workspace: top nav · left rail · config panel · center
// preview · right rail. Difference is what each panel does.
//
//   - Config:  prompt + a couple of generation knobs (provider, aspect ratio).
//   - Center:  the most recently selected generated image.
//   - Aside:   gallery of images generated in this session, plus the
//              "Send to 3D" action to push one into the image-to-3D flow.
//
// First iteration scope:
//   - Single provider (Pollinations / Flux via /api/text2image proxy).
//   - In-memory session gallery (lost on reload). DB persistence is a later
//     pass — the goal of v1 is to validate UX.
//   - "Send to 3D" stashes the blob in sessionStorage under PENDING_KEY.
//     Workspace reads it on mount and pre-fills the upload slot.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { useAppUser } from '../context/UserContext';
import { signOutUser } from '../firebase';
import { Dropdown } from '../components/Dropdown';
import { confirm } from '../components/ConfirmModal';
import { IconClose } from '../components/Icons';
import {
  ImageController,
  ImageToolsRail,
  BgRemovalDialog,
  type ImageTool,
  type BgRemovalParams,
  type ControlledImage,
  type ControlledAltView,
  type DetailSection,
  type ViewLabel,
} from '../components/imageController';
import { IconCutout } from '../components/Icons';

// SessionStorage key used to hand a generated image to the Workspace page.
// (Workspace will need to read this on mount in a follow-up commit.)
export const PENDING_IMAGE_KEY = 'genshape3d.pendingTextImage';

// ─────────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────────

type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9';
// `dark` is kept here only so existing DB rows (generated before we
// removed the option) still type-check on restore. Not exposed in the UI.
type Background = 'white' | 'studio' | 'dark' | 'black' | 'iso';
// View = pure camera direction. Six options for full multi-view 3D coverage.
type ViewAngle  = 'front' | 'three_q' | 'side' | 'back' | 'top' | 'bottom';
// Projection = how perspective is drawn. Independent of direction and style.
type Projection = 'perspective' | 'isometric';
type Scale      = 'fill' | 'margin';
type StyleKind  = 'photoreal' | 'clay' | 'neutral' | 'toon';
type Material   = 'auto' | 'ceramic' | 'metal' | 'wood' | 'plastic' | 'fabric' | 'glass' | 'stone';
type Provider   = 'pollinations' | 'fal-flux-schnell' | 'fal-flux-pro' | 'hf-flux-schnell' | 'openai-dall-e-3';

interface GenParams {
  bg: Background;
  view: ViewAngle;
  projection: Projection;
  scale: Scale;
  style: StyleKind;
  material: Material;
  negative: string;
  aspect: AspectRatio;
  provider: Provider;
  // When true, we hard-enforce "exactly one subject" so prompts like "a pawn"
  // don't return a full chess set.
  strictSingle: boolean;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  'pollinations':     'Pollinations',
  'fal-flux-schnell': 'fal · Schnell',
  'fal-flux-pro':     'fal · Pro 1.1',
  'hf-flux-schnell':  'HF · Schnell',
  'openai-dall-e-3':  'OpenAI · DALL-E 3',
};

// Admin-only hints — show per-image cost so we can keep an eye on spend
// when picking a provider.
const PROVIDER_HINT_ADMIN: Record<Provider, string> = {
  'pollinations':     'Free · slower when busy',
  'fal-flux-schnell': '~3s · ~$0.003/image · fast & high quality',
  'fal-flux-pro':     '~6s · ~$0.04/image · top-shelf quality',
  'hf-flux-schnell':  'Unavailable · service down',
  'openai-dall-e-3':  '~10s · ~$0.04/image · prompt-faithful',
};

// User-facing hints — speed + quality only, no pricing exposed.
const PROVIDER_HINT_USER: Record<Provider, string> = {
  'pollinations':     'Free · slower when busy',
  'fal-flux-schnell': 'Fast · high quality',
  'fal-flux-pro':     'Slower · top quality',
  'hf-flux-schnell':  'Unavailable · service down',
  'openai-dall-e-3':  'Slower · prompt-faithful',
};

const DEFAULT_PARAMS: GenParams = {
  bg: 'black',
  view: 'front',
  projection: 'perspective',
  scale: 'margin',
  style: 'clay',
  material: 'auto',
  negative: '',
  aspect: '1:1',
  provider: 'fal-flux-schnell',
  strictSingle: true,
};

// One asset in the gallery. After persistence each generated image is saved
// to R2 + Postgres, so `imageKey` (R2 key) is the canonical identity. We
// render via /api/image?key=…  which streams the bytes through our backend.
interface GeneratedImage {
  id: string;            // local + server id (same value once persisted)
  prompt: string;
  name: string;          // editable display name (smart-generated from prompt)
  imageKey: string;      // R2 key — survives reloads
  url: string;           // either /api/image?key=… or a fresh blob ObjectURL
  blob?: Blob;           // populated for in-flight items so we can send to 3D
                         //   without re-fetching from R2 immediately
  createdAt: number;
  params: GenParams;
  finalPrompt?: string;
  seed?: string;
  /** When set, this image is an alt view of the parent asset id. Primary
   *  views (the front view originally generated) have parentAssetId = null. */
  parentAssetId?: string | null;
  /** Angle label: 'front' (default), 'three_q', 'side', 'back'. */
  viewLabel?: string;
  /** When false, this image is excluded from the Workspace's 3D-conversion
   *  picker. Defaults to true. User toggles via the details panel. */
  readyFor3D?: boolean;
  /** Set when imageKey is an edited version (e.g. background removed).
   *  Drives the "Revert to original" affordance in BgRemovalDialog. */
  originalImageKey?: string | null;
}

// Mirror of the server's smartAssetName — used for in-memory items generated
// before the server response arrives (so the name appears immediately).
const STOP = new Set([
  'a','an','the','this','that','some','any',
  'with','without','and','or','but','of','in','on','at','to','for','from','by',
  'very','quite','really','slightly','heavily','perfectly','beautifully',
  'small','large','big','tiny','huge','little',
  'old','new','modern','ancient','simple','complex',
  'no','not','just','only','also','even',
]);
const smartName = (prompt: string): string => {
  const words = prompt.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w));
  const picked = words.slice(0, 3);
  if (!picked.length) return prompt.slice(0, 32).trim();
  return picked.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const ASPECT_PIXELS: Record<AspectRatio, { w: number; h: number }> = {
  '1:1':  { w: 1024, h: 1024 },
  '4:3':  { w: 1024, h: 768  },
  '3:4':  { w: 768,  h: 1024 },
  '16:9': { w: 1280, h: 720  },
};

const BG_LABEL: Record<Background, string>            = { white: 'White', studio: 'Grey', dark: 'Dark', black: 'Black', iso: 'Isolated' };
// Backgrounds shown in the picker. Order matters — Isolated last as it's
// the "no background" choice. `dark` is intentionally NOT in this list;
// it remains a valid type only for legacy assets.
const VIEW_LABEL: Record<ViewAngle, string>           = { front: 'Front', three_q: '3/4 front', side: 'Side', back: 'Back', top: 'Top', bottom: 'Bottom' };
const PROJECTION_LABEL: Record<Projection, string>    = { perspective: 'Perspective', isometric: 'Isometric' };
const SCALE_LABEL: Record<Scale, string>              = { fill: 'Fill frame',   margin: 'Centered + margin' };
const STYLE_LABEL: Record<StyleKind, string>          = { photoreal: 'Photoreal', clay: 'Clay', neutral: 'Neutral', toon: 'Toon 3D' };
const MATERIAL_LABEL: Record<Material, string> = {
  auto: 'Auto', ceramic: 'Ceramic', metal: 'Metal', wood: 'Wood',
  plastic: 'Plastic', fabric: 'Fabric', glass: 'Glass', stone: 'Stone',
};

// ─────────────────────────────────────────────────────────────────────────────
// Animations
// ─────────────────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;
const sweep = keyframes`
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
`;
const rotate = keyframes`
  from { transform: rotate(0deg); } to { transform: rotate(360deg); }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Shell — mirrors Workspace
// ─────────────────────────────────────────────────────────────────────────────

const Shell = styled.div`
  display: grid;
  grid-template-rows: 56px 1fr;
  height: 100vh;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, ${p => p.theme.colors.primary}14, transparent 60%),
    radial-gradient(ellipse 60% 40% at 100% 100%, ${p => p.theme.colors.violet}10, transparent 60%),
    ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: 64px 320px minmax(0, 1fr) 320px;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  @media (max-width: 1280px) { grid-template-columns: 64px 300px minmax(0, 1fr) 280px; }
  @media (max-width: 1100px) { grid-template-columns: 64px 280px minmax(0, 1fr) 240px; }
  @media (max-width: 1024px) { grid-template-columns: 56px 280px minmax(0, 1fr); }
  @media (max-width: 720px)  { grid-template-columns: 56px minmax(0, 1fr); }
`;

const NavBar = styled.header`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem 0 1.25rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: linear-gradient(180deg, ${p => p.theme.colors.surfaceHigh}, ${p => p.theme.colors.surface});
  backdrop-filter: blur(8px);
  z-index: 10;
`;

const BrandWrap = styled(Link)`
  display: flex; align-items: center; gap: 0.55rem;
  font-weight: 800; letter-spacing: 0.04em; font-size: 0.95rem;
  color: ${p => p.theme.colors.text};
  text-decoration: none;
  &:hover { opacity: 0.85; }
`;

const BrandMark = styled.div`
  width: 28px; height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  display: flex; align-items: center; justify-content: center;
  color: white;
  box-shadow: 0 4px 14px ${p => p.theme.colors.primary}66;
  font-size: 0.95rem;
`;

const NavSpacer = styled.div`flex: 1;`;

const RolePill = styled.div<{ $admin?: boolean }>`
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 1rem;
  border: 1.5px solid ${p => p.$admin ? p.theme.colors.violet : p.theme.colors.borderHigh};
  background: ${p => p.$admin
    ? `linear-gradient(135deg, ${p.theme.colors.primary}33, ${p.theme.colors.violet}33)`
    : p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  ${p => p.$admin && `box-shadow: 0 0 14px ${p.theme.colors.violet}55;`}
`;

const Avatar = styled.img`
  width: 32px; height: 32px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
`;
const AvatarFallback = styled.button`
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Left icon rail
// ─────────────────────────────────────────────────────────────────────────────

const Rail = styled.aside`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 0;
  gap: 0.4rem;
  border-right: 1px solid ${p => p.theme.colors.border};
  background: linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
`;

const RailBtn = styled.button<{ $active?: boolean; $disabled?: boolean }>`
  width: 44px; height: 44px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  font-size: 1rem;
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$active ? 'white' : p.$disabled ? p.theme.colors.textMuted : p.theme.colors.text};
  border: 1px solid transparent;
  opacity: ${p => p.$disabled ? 0.4 : 1};
  transition: background 0.15s, transform 0.12s;
  ${p => p.$active && `box-shadow: 0 4px 18px ${p.theme.colors.primary}66;`}
  &:hover {
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

const RailDivider = styled.div`
  width: 24px;
  height: 1px;
  background: ${p => p.theme.colors.border};
  margin: 0.4rem 0;
`;

const RailItem: React.FC<{
  icon: string; label: string;
  active?: boolean; disabled?: boolean;
  onClick?: () => void; title?: string;
}> = ({ icon, label, active, disabled, onClick, title }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <RailBtn $active={active} $disabled={disabled}
             onClick={disabled ? undefined : onClick}
             title={title || label}>{icon}</RailBtn>
    <RailLabel>{label}</RailLabel>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Config panel
// ─────────────────────────────────────────────────────────────────────────────

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${p => p.theme.colors.border};
  background:
    radial-gradient(ellipse 100% 40% at 50% 0%, ${p => p.theme.colors.primary}0d, transparent 70%),
    linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
  min-width: 0;
  overflow: hidden;
  @media (max-width: 720px) { display: none; }
`;

const PanelHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.85rem 1rem 0.65rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

const PanelTitle = styled.h2`
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${p => p.theme.colors.textMuted};
  margin: 0;
`;

const PanelBody = styled.div`
  flex: 1;
  padding: 0.85rem 1rem 1rem;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 0.7rem;
`;

const Field = styled.div`
  display: flex; flex-direction: column; gap: 0.3rem;
`;

const FieldLabel = styled.label`
  font-size: 0.66rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  letter-spacing: 0.04em;
  display: flex; align-items: center; justify-content: space-between;
  text-transform: uppercase;
`;

const FieldHint = styled.span`
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: ${p => p.theme.colors.textMuted};
  opacity: 0.7;
  font-size: 0.68rem;
`;

// Section divider — separates groups of related fields without screaming.
const SectionDivider = styled.div`
  height: 1px;
  background: ${p => p.theme.colors.border};
  margin: 0.4rem -1rem 0.1rem;
  opacity: 0.6;
`;

const SectionHeader = styled.div`
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
  opacity: 0.55;
  margin: 0.25rem 0 -0.15rem;
`;

// Two-column row for short paired controls (saves vertical space).
const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
`;

// Custom toggle to replace native checkboxes (which look out of place against
// our gradient theme).
const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.74rem;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  margin-top: 0.2rem;
  user-select: none;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const ToggleSwitch = styled.span<{ $on: boolean }>`
  position: relative;
  width: 30px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 999px;
  background: ${p => p.$on
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : p.theme.colors.surfaceHigh};
  border: 1px solid ${p => p.$on ? 'transparent' : p.theme.colors.borderHigh};
  transition: background 0.15s, border-color 0.15s;
  ${p => p.$on && `box-shadow: 0 0 8px ${p.theme.colors.primary}66;`}
`;

const ToggleKnob = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 1px;
  left: ${p => p.$on ? '15px' : '1px'};
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${p => p.$on ? '#fff' : p.theme.colors.text};
  transition: left 0.16s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
`;

const TextToImageBulkBtn = styled.button<{ $disabled?: boolean }>`
  width: 100%;
  padding: 0.6rem 0.75rem;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  border-radius: 10px;
  border: 0;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  background: ${p => p.$disabled
    ? p.theme.colors.surfaceHigh
    : `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`};
  color: ${p => p.$disabled ? p.theme.colors.textMuted : 'white'};
  margin-top: 0.4rem;
  box-shadow: ${p => p.$disabled ? 'none' : `0 6px 20px ${p.theme.colors.primary}55`};
  &:hover { ${p => !p.$disabled && `filter: brightness(1.1);`} }
  &:disabled { pointer-events: none; }
`;

const SelectField = styled.select`
  padding: 0.42rem 0.6rem;
  border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, ${p => p.theme.colors.textMuted} 50%),
                    linear-gradient(135deg, ${p => p.theme.colors.textMuted} 50%, transparent 50%);
  background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  padding-right: 1.75rem;
  &:hover  { border-color: ${p => p.theme.colors.borderHigh}; }
  &:focus  { outline: none; border-color: ${p => p.theme.colors.violet}; box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}33; }
`;

const PromptArea = styled.textarea`
  width: 100%;
  min-height: 96px;
  resize: vertical;
  padding: 0.6rem 0.75rem;
  font: inherit;
  font-size: 0.82rem;
  border-radius: 10px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${p => p.theme.colors.violet};
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}33;
  }
  &::placeholder { color: ${p => p.theme.colors.textMuted}; opacity: 0.6; }
`;

const Segmented = styled.div`
  display: flex;
  /* Wrap onto a second row when labels don't fit. Better UX than ellipsis
     truncation — the user can always read the full option. */
  flex-wrap: wrap;
  background: ${p => p.theme.colors.background}80;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
`;

const SegmentedBtn = styled.button<{ $active?: boolean }>`
  /* flex-grow + flex-basis so each chip takes its share of the row but
     never narrower than its content needs (no truncation). */
  flex: 1 1 auto;
  padding: 0.4rem 0.6rem;
  border: 0;
  border-radius: 7px;
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$active ? 'white' : p.theme.colors.text};
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.01em;
  white-space: nowrap;     /* keep each label on a single line */
  ${p => p.$active && `box-shadow: 0 2px 8px ${p.theme.colors.primary}66;`}
`;

const PanelFooter = styled.div`
  border-top: 1px solid ${p => p.theme.colors.border};
  padding: 0.85rem 1rem 1rem;
  background: ${p => p.theme.colors.surface};
  display: flex; flex-direction: column; gap: 0.6rem;
`;

const GenerateBtn = styled.button<{ $disabled?: boolean }>`
  width: 100%;
  padding: 0.85rem 1rem;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  position: relative;
  overflow: hidden;
  transition: transform 0.12s, box-shadow 0.12s;
  background: ${p => p.$disabled
    ? p.theme.colors.surfaceHigh
    : `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`};
  color: ${p => p.$disabled ? p.theme.colors.textMuted : 'white'};
  box-shadow: ${p => p.$disabled ? 'none' : `0 6px 22px ${p.theme.colors.primary}66`};
  &:hover { ${p => !p.$disabled && `transform: translateY(-1px); box-shadow: 0 8px 30px ${p.theme.colors.violet}88;`} }
  &:disabled { pointer-events: none; }
  &::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);
    animation: ${sweep} 2.6s linear infinite;
    opacity: ${p => p.$disabled ? 0 : 1};
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Center viewport
// ─────────────────────────────────────────────────────────────────────────────

const Viewport = styled.section`
  position: relative;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse 60% 60% at 30% 25%, ${p => p.theme.colors.primary}26, transparent 60%),
    radial-gradient(ellipse 55% 55% at 75% 80%, ${p => p.theme.colors.violet}1f, transparent 60%),
    radial-gradient(ellipse 100% 100% at 50% 50%, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
  overflow: hidden;
  min-width: 0;
`;

// Top-of-viewport bar — holds the provider selector + generation cost hint.
// Lives here (not in the config panel) because the provider is a global
// "engine" choice, not a per-prompt parameter.
const ViewportBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface}cc;
  backdrop-filter: blur(8px);
`;

const VBLabel = styled.span`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
`;

const VBHint = styled.span`
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
`;

const ProviderSelect = styled.select`
  padding: 0.42rem 2rem 0.42rem 0.75rem;
  border-radius: 999px;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, ${p => p.theme.colors.textMuted} 50%),
                    linear-gradient(135deg, ${p => p.theme.colors.textMuted} 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  &:hover { border-color: ${p => p.theme.colors.violet}; }
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}33; }
`;

// Wraps the actual stage so the gradients live behind the image instead of
// behind the toolbar.
// StageWrap is the horizontal slot that holds the BigImage area + the
// vertical ImageToolsRail on the right. The Stage takes all remaining
// space; the rail is fixed-width.
const StageWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: stretch;
  padding: 1.5rem;
  gap: 0.5rem;
  position: relative;
  min-height: 0;
`;

const Stage = styled.div`
  flex: 1;
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const BigImage = styled.img`
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  animation: ${fadeIn} 0.25s ease;
`;

const EmptyState = styled.div`
  display: flex; flex-direction: column; align-items: center;
  gap: 1rem;
  text-align: center;
  max-width: 420px;
  padding: 0 2rem;
`;

const EmptyTitle = styled.h1`
  font-family: 'Space Grotesk', 'Inter', sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
`;

const EmptyAccent = styled.span`
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const EmptySub = styled.p`
  font-size: 0.92rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.55;
  margin: 0;
`;

// Action bar that overlays the bottom of the big image when one is shown.
// (Old DetailsPanel-local action chips moved into
//  components/imageController/ImageActionsBar.tsx — see ImageController.)

// Floating loader while a generation is in flight
const RunningCard = styled.div`
  position: absolute;
  top: 16px; left: 50%;
  transform: translateX(-50%);
  background: ${p => p.theme.colors.surface}f2;
  backdrop-filter: blur(10px);
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 12px;
  padding: 0.6rem 1rem;
  display: flex; align-items: center; gap: 0.6rem;
  z-index: 5;
  font-size: 0.82rem; font-weight: 600;
`;

const RunningSpinner = styled.div`
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 2px solid ${p => p.theme.colors.violet}33;
  border-top-color: ${p => p.theme.colors.violet};
  animation: ${rotate} 0.9s linear infinite;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Right rail (asset gallery — session only for v1)
// ─────────────────────────────────────────────────────────────────────────────

const Aside = styled.aside`
  display: flex;
  flex-direction: column;
  border-left: 1px solid ${p => p.theme.colors.border};
  background:
    radial-gradient(ellipse 100% 40% at 50% 0%, ${p => p.theme.colors.violet}0d, transparent 70%),
    linear-gradient(180deg, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
  min-width: 0;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  @media (max-width: 1024px) { display: none; }
`;

const AsideHeader = styled.div`
  padding: 0.85rem 1rem 0.65rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`;

const AsideTitle = styled.h2`
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${p => p.theme.colors.textMuted};
  margin: 0;
`;

const AsideHint = styled.div`
  font-size: 0.7rem;
  color: ${p => p.theme.colors.textMuted};
`;

const Search = styled.input`
  width: 100%;
  padding: 0.5rem 0.8rem;
  font: inherit;
  font-size: 0.82rem;
  border-radius: 9px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${p => p.theme.colors.violet};
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}33;
  }
  &::placeholder { color: ${p => p.theme.colors.textMuted}; opacity: 0.6; }
`;

const AssetGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem 0.6rem;
  padding: 0.85rem 1rem 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  align-content: start;
  min-width: 0;
  box-sizing: border-box;
  width: 100%;
`;

/* Wrapper so name lives below the square thumb — prevents grid stretch
   from breaking the card's aspect-ratio. position:relative anchors the tooltip. */
const AssetItem = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
`;

const AssetCard = styled.button<{ $active?: boolean }>`
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  border: 1.5px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  flex-shrink: 0;          /* don't let column flex compress the card */
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
  &:hover {
    transform: translateY(-2px);
    border-color: ${p => p.theme.colors.violet};
    box-shadow: 0 6px 20px ${p => p.theme.colors.violet}44;
  }
`;

const AssetThumb = styled.img`
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
`;

// Always-visible "Send N to 3D" bar above the gallery — disabled (greyed)
// when nothing is picked, so the UI never shifts up/down.
const SendToThreeDBar = styled.div`
  display: flex;
  gap: 0.4rem;
  padding: 0.55rem 0.85rem;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}14, ${p => p.theme.colors.violet}14);
  border-bottom: 1px solid ${p => p.theme.colors.border};
  flex-wrap: wrap;
  min-width: 0;
`;

const SendToThreeDBtn = styled.button`
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  box-shadow: 0 6px 20px ${p => p.theme.colors.primary}55;
  &:hover:not(:disabled) { filter: brightness(1.1); }
  &:disabled {
    background: ${p => p.theme.colors.surfaceHigh};
    color: ${p => p.theme.colors.textMuted};
    box-shadow: none;
    cursor: not-allowed;
  }
`;

const SendToThreeDClearBtn = styled.button`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  &:hover:not(:disabled) { color: ${p => p.theme.colors.text}; border-color: ${p => p.theme.colors.borderHigh}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// Per-card delete button — matches the CardActionBtn pattern in Workspace.tsx
// for consistency: circular, dark glass default, theme-pink hover with soft
// glow (no scale to avoid sub-pixel icon drift). SVG IconClose is centered
// via inline-flex + line-height: 0 + & > svg { display: block }.
// Tiny "+N views" pill rendered at the bottom-left of cards that have alt
// views. Always visible (not hover-gated) so the user knows at a glance
// which images are multi-angle without having to mouse over.
const ViewsBadge = styled.div`
  position: absolute;
  bottom: 6px; left: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: ${p => p.theme.colors.violet}d9;
  color: white;
  pointer-events: none;
  z-index: 2;
  box-shadow: 0 2px 6px rgba(0,0,0,0.35);
`;

// (Old per-card "Make 3D-ready views" button removed — alt-view generation
//  now happens per-slot from the ImageController panel below the stage.)

const DeleteBtn = styled.button`
  position: absolute;
  top: 6px; right: 6px;
  width: 24px; height: 24px;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(8, 6, 16, 0.62);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255,255,255,0.78);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  font-size: 0;
  opacity: 0;
  transition: opacity 160ms ease, background 200ms ease, color 200ms ease,
              border-color 200ms ease, box-shadow 200ms ease;
  z-index: 3;
  & > svg { display: block; }
  ${AssetItem}:hover & { opacity: 1; }
  &:hover {
    background: ${p => p.theme.colors.violet};
    border-color: ${p => p.theme.colors.violet};
    color: #fff;
    box-shadow: 0 4px 14px ${p => p.theme.colors.violet}55;
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}55;
  }
`;

// Per-card pick-for-3D checkbox in the top-left of the thumb.
const PickToggle = styled.button<{ $picked: boolean }>`
  position: absolute;
  top: 6px; left: 6px;
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 1.5px solid ${p => p.$picked ? 'transparent' : 'rgba(255,255,255,0.6)'};
  background: ${p => p.$picked
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'rgba(0,0,0,0.45)'};
  backdrop-filter: blur(4px);
  color: white;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${p => p.$picked ? `0 0 0 2px ${p.theme.colors.violet}66` : 'none'};
  transition: background 0.12s, box-shadow 0.12s;
  &:hover { box-shadow: 0 0 0 2px ${p => p.theme.colors.violet}55; }
`;

const EmptyAssets = styled.div`
  grid-column: 1 / -1;
  text-align: center;
  font-size: 0.82rem;
  color: ${p => p.theme.colors.textMuted};
  padding: 2rem 0.5rem;
  display: flex; flex-direction: column; gap: 0.5rem;
  align-items: center;
`;

// Name row — lives BELOW the card thumbnail, always visible.
const CardNameText = styled.div`
  font-size: 0.68rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
  letter-spacing: 0.02em;
  padding: 0 2px;
  transition: color 0.12s;
  ${AssetItem}:hover & { color: ${p => p.theme.colors.text}; }
`;

const CardNameInput = styled.input`
  width: 100%;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text};
  background: transparent;
  border: none;
  border-bottom: 1px solid ${p => p.theme.colors.violet};
  outline: none;
  padding: 0 2px;
  letter-spacing: 0.02em;
  &::placeholder { color: ${p => p.theme.colors.textMuted}; opacity: 0.6; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const TextToImage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { appUser } = useAppUser();

  const [prompt, setPrompt] = useState('');
  const [params, setParams] = useState<GenParams>(DEFAULT_PARAMS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>('');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const idRef = useRef(0);

  // Multi-select state for the gallery — user picks N favorites then bulk-
  // submits them through the regular /api/upload flow.
  const [search, setSearch] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  // (Hover state removed — details now driven by SELECTED image only.)

  // Per-slot busy tracker for alt-view generation. Keys are
  // `${parentAssetId}:${viewLabel}` so two slots in different groups
  // can be in flight at the same time and we can render the spinner
  // on exactly the right slot.
  const [busyAltViewKeys, setBusyAltViewKeys] = useState<Set<string>>(new Set());
  const altViewBusyKey = (parentId: string, label: ViewLabel) => `${parentId}:${label}`;

  // Primary images = the gallery's top-level cards. Alt views are looked up
  // separately by parent id and surfaced in the detail overlay / card badge.
  const primaryImages = useMemo(
    () => images.filter(i => !i.parentAssetId),
    [images],
  );
  const altViewsByParent = useMemo(() => {
    const m = new Map<string, GeneratedImage[]>();
    for (const i of images) {
      if (!i.parentAssetId) continue;
      const arr = m.get(i.parentAssetId) || [];
      arr.push(i);
      m.set(i.parentAssetId, arr);
    }
    return m;
  }, [images]);

  /** Generate ONE alt view at the given angle for the given parent image.
   *  Skips silently if a request for this exact (parent, label) is already
   *  in flight. Persists one new asset row server-side. */
  const onGenerateAltView = useCallback(async (parentId: string, label: ViewLabel) => {
    if (!user?.email) return;
    const key = altViewBusyKey(parentId, label);
    setBusyAltViewKeys(prev => {
      if (prev.has(key)) return prev;
      const n = new Set(prev); n.add(key); return n;
    });
    try {
      const r = await fetch('/api/text2image/alt-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, parentAssetId: parentId, viewLabel: label }),
      });
      if (!r.ok) {
        console.warn('alt-views failed', await r.text());
        return;
      }
      const data = await r.json() as { asset: any };
      const a = data.asset;
      if (!a) return;
      const next: GeneratedImage = {
        id: a.id,
        prompt: a.prompt,
        name: a.name || smartName(a.prompt),
        imageKey: a.imageKey,
        url: `/api/image?key=${encodeURIComponent(a.imageKey)}`,
        createdAt: new Date(a.createdAt).getTime() || Date.now(),
        params: { ...DEFAULT_PARAMS, ...(a.params || {}), provider: a.provider || DEFAULT_PARAMS.provider },
        finalPrompt: a.finalPrompt,
        seed: a.seed != null ? String(a.seed) : undefined,
        parentAssetId: a.parentAssetId ?? null,
        viewLabel: a.viewLabel || '',
        readyFor3D: a.readyFor3D !== false,
        originalImageKey: a.originalImageKey ?? null,
      };
      setImages(prev => [...prev, next]);
    } finally {
      setBusyAltViewKeys(prev => {
        if (!prev.has(key)) return prev;
        const n = new Set(prev); n.delete(key); return n;
      });
    }
  }, [user?.email]);

  /** Regenerate one alt view: delete the old one (locally + server),
   *  then immediately request a fresh one at the same angle. The slot's
   *  spinner stays visible across both steps because onGenerateAltView
   *  sets the busy key right away. */
  const onRegenerateAltView = useCallback(async (parentId: string, label: ViewLabel, currentId: string) => {
    // Optimistic local removal so the slot empties before the new image
    // appears (avoids a flash of "old image still here").
    setImages(prev => prev.filter(i => i.id !== currentId));
    setSelectedId(curr => curr === currentId ? parentId : curr);
    fetch(`/api/text2image/assets/${currentId}`, { method: 'DELETE' }).catch(() => {});
    await onGenerateAltView(parentId, label);
  }, [onGenerateAltView]);

  /** Delete an alt view by id. Soft-deletes server-side, removes from local
   *  state. The big preview snaps back to the parent if the deleted view
   *  was selected. */
  const onDeleteAltView = useCallback(async (id: string) => {
    const target = images.find(i => i.id === id);
    if (!target) return;
    setImages(prev => prev.filter(i => i.id !== id));
    setSelectedId(curr =>
      curr === id ? (target.parentAssetId ?? null) : curr,
    );
    fetch(`/api/text2image/assets/${id}`, { method: 'DELETE' }).catch(() => {});
  }, [images]);

  /** Persist a name change for the SELECTED image (works for primaries +
   *  alt views — they share the same /name endpoint). */
  const onChangeSelectedName = useCallback((next: string) => {
    if (!selectedId) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    setImages(prev => prev.map(i => i.id === selectedId ? { ...i, name: trimmed } : i));
    fetch(`/api/text2image/assets/${selectedId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => {});
  }, [selectedId]);

  // ── ImageController inputs ──────────────────────────────────────────────
  // The controller below the stage represents a "subject" — a primary image
  // and the alt views attached to it. We compute everything it needs in
  // one place so the JSX stays small.

  /** The currently-selected image — may be a primary OR an alt view. */
  const selected = useMemo<GeneratedImage | null>(
    () => images.find(i => i.id === selectedId) ?? null,
    [images, selectedId],
  );

  /** The PRIMARY image of the selected image's group. Equals `selected`
   *  when the user has the original selected, otherwise the parent. */
  const primaryImage = useMemo(() => {
    if (!selected) return null;
    if (!selected.parentAssetId) return selected;
    return images.find(i => i.id === selected.parentAssetId) || selected;
  }, [images, selected]);

  /** Alt views attached to the primary's group, sorted to a stable order. */
  const groupAltViews = useMemo<ControlledAltView[]>(() => {
    if (!primaryImage) return [];
    const list = altViewsByParent.get(primaryImage.id) || [];
    return list.map(v => ({
      id: v.id,
      url: v.url,
      viewLabel: (v.viewLabel || 'front') as ViewLabel,
    }));
  }, [primaryImage, altViewsByParent]);

  /** Set of view labels currently being generated for the active group. */
  const busyViewLabels = useMemo<Set<ViewLabel>>(() => {
    const out = new Set<ViewLabel>();
    if (!primaryImage) return out;
    const prefix = `${primaryImage.id}:`;
    for (const k of busyAltViewKeys) {
      if (k.startsWith(prefix)) out.add(k.slice(prefix.length) as ViewLabel);
    }
    return out;
  }, [busyAltViewKeys, primaryImage]);

  /** Convert a GeneratedImage (page-local shape) into the ControlledImage
   *  shape the controller expects. */
  const toControlled = (i: GeneratedImage | null): ControlledImage | null =>
    i ? {
      id:         i.id,
      url:        i.url,
      name:       i.name,
      isPrimary:  !i.parentAssetId,
      viewLabel:  i.viewLabel || 'front',
      readyFor3D: i.readyFor3D !== false,
    } : null;

  // ── Sectioned read-only details for the controller's data grid ──────────
  // Build the sectioned details for the SELECTED image. Memoised — rebuilds
  // when selectedId changes, when the image's params change, or when
  // alt-view counts change.
  const selectedSections = useMemo<DetailSection[] | null>(() => {
    const i = images.find(x => x.id === selectedId);
    if (!i) return null;
    const altViews = i.parentAssetId
      ? []                                              // alt view itself — no nesting
      : altViewsByParent.get(i.id) || [];
    const angleStr = altViews.length > 0
      ? `${altViews.length}/3 generated (${altViews.map(v => v.viewLabel || '?').join(' · ')})`
      : 'none generated';
    // Prompt + composed prompt are NOT in this list on purpose — they're
    // rendered next to the view grid (and behind a hover icon) by
    // ImageController, so they don't take up extra vertical space here.
    return [
      {
        heading: 'Composition',
        rows: [
          { label: 'View',       value: VIEW_LABEL[i.params.view] || i.params.view },
          { label: 'Projection', value: PROJECTION_LABEL[i.params.projection ?? 'perspective'] },
          { label: 'Aspect',     value: i.params.aspect },
          { label: 'Scale',      value: SCALE_LABEL[i.params.scale] },
          { label: 'Background', value: BG_LABEL[i.params.bg] },
        ],
      },
      {
        heading: 'Style',
        rows: [
          { label: 'Style',    value: STYLE_LABEL[i.params.style] },
          { label: 'Material', value: MATERIAL_LABEL[i.params.material] },
          { label: 'Strict',   value: i.params.strictSingle ? 'Single subject' : 'Free' },
        ],
      },
      {
        heading: 'Generation',
        rows: [
          { label: 'Provider', value: PROVIDER_LABEL[i.params.provider] || i.params.provider },
          { label: 'Seed',     value: i.seed || '—', mono: true },
          { label: 'Created',  value: new Date(i.createdAt).toLocaleString() },
        ],
      },
      {
        heading: '3D',
        rows: [
          { label: 'Status',     value: i.readyFor3D !== false ? 'Ready' : 'Excluded' },
          { label: 'Alt views',  value: angleStr },
        ],
      },
    ];
  }, [images, selectedId, altViewsByParent]);

  // Toggle the readyFor3D flag on the selected image. Optimistic local
  // update, persisted to the server in the background.
  const onToggleReadyFor3D = useCallback(async () => {
    const i = images.find(x => x.id === selectedId);
    if (!i) return;
    const next = !(i.readyFor3D !== false);
    setImages(prev => prev.map(x => x.id === i.id ? { ...x, readyFor3D: next } : x));
    fetch(`/api/text2image/assets/${i.id}/ready-for-3d`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ready: next }),
    }).catch(() => {
      // Revert on failure.
      setImages(prev => prev.map(x => x.id === i.id ? { ...x, readyFor3D: !next } : x));
    });
  }, [images, selectedId]);

  // Tiny helper to update a single field of `params` immutably.
  const setParam = <K extends keyof GenParams>(k: K, v: GenParams[K]) =>
    setParams(p => ({ ...p, [k]: v }));

  const isAdmin = appUser?.role === 'admin';

  // Per-call cost surfaced ONLY to admins via the gold tooltip on the
  // view-slot + and ↻ buttons. Bumped manually whenever we swap the
  // alt-view model on the server side. Non-admins never see this.
  // (When user-facing billing lands later, swap this for a credit cost
  //  instead of a $ figure.)
  const ALT_VIEW_COST_PER_CALL = '≈$0.025';
  const adminCostPerView = isAdmin ? ALT_VIEW_COST_PER_CALL : undefined;
  // Background removal is local CPU work — effectively free, but a tiny
  // fixed cost for the rembg model load on cold starts.
  const BG_EDIT_COST = 'free (CPU)';
  const adminCostBgEdit = isAdmin ? BG_EDIT_COST : undefined;

  // Bg-removal dialog state. Opened from the right-side ImageToolsRail.
  const [bgEditOpen, setBgEditOpen] = useState(false);
  const [bgEditBusy, setBgEditBusy] = useState(false);

  // Hex string → [r, g, b] for the server. Browser handles parsing.
  function hexToRgb(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  }

  /** Replace the selected image's bg with the user-chosen settings. The
   *  server preserves the original — re-edits always start from scratch. */
  const onEditBackground = useCallback(async (params: BgRemovalParams) => {
    if (!user?.email || !selectedId) return;
    setBgEditBusy(true);
    try {
      const r = await fetch(`/api/text2image/assets/${selectedId}/edit-bg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          alphaThreshold: params.alphaThreshold,
          erodePx: params.erodePx,
          fillRgb: params.fillColor ? hexToRgb(params.fillColor) : undefined,
        }),
      });
      if (!r.ok) {
        console.warn('edit-bg failed', await r.text());
        return;
      }
      const data = await r.json() as { asset: any };
      const a = data.asset;
      // Replace the asset's image url + bust the browser cache by appending
      // a cache-buster — the R2 key changed but if any UI cached the old
      // URL we want it re-fetched.
      setImages(prev => prev.map(i => i.id === a.id ? {
        ...i,
        imageKey: a.imageKey,
        originalImageKey: a.originalImageKey ?? null,
        url: `/api/image?key=${encodeURIComponent(a.imageKey)}&v=${Date.now()}`,
      } : i));
      setBgEditOpen(false);
    } finally {
      setBgEditBusy(false);
    }
  }, [user?.email, selectedId]);

  /** Restore the original image for the selected asset. */
  const onRevertBackground = useCallback(async () => {
    if (!user?.email || !selectedId) return;
    setBgEditBusy(true);
    try {
      const r = await fetch(`/api/text2image/assets/${selectedId}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      if (!r.ok) return;
      const data = await r.json() as { asset: any };
      const a = data.asset;
      setImages(prev => prev.map(i => i.id === a.id ? {
        ...i,
        imageKey: a.imageKey,
        originalImageKey: a.originalImageKey ?? null,
        url: `/api/image?key=${encodeURIComponent(a.imageKey)}&v=${Date.now()}`,
      } : i));
      setBgEditOpen(false);
    } finally {
      setBgEditBusy(false);
    }
  }, [user?.email, selectedId]);

  // Tools shown in the right-side rail when an image is selected. Each
  // entry is purely declarative — adding a new tool here is one push.
  const imageTools: ImageTool[] = useMemo(() => selected ? [
    {
      id: 'edit-bg',
      label: 'Edit background',
      icon: <IconCutout size={16} />,
      onClick: () => setBgEditOpen(true),
      adminCost: adminCostBgEdit,
    },
  ] : [], [selected, adminCostBgEdit]);
  const initials = (user?.displayName || user?.email || '?').slice(0, 1).toUpperCase();

  // (`selected` is declared above with the other ImageController inputs.)

  // Load persisted assets on mount
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/text2image/assets?email=${encodeURIComponent(user.email!)}`);
        if (!r.ok) return;
        const data = await r.json() as { assets: Array<any> };
        if (cancelled) return;
        const restored: GeneratedImage[] = data.assets.map(a => ({
          id: a.id,
          prompt: a.prompt,
          name: a.name || smartName(a.prompt),
          imageKey: a.imageKey,
          url: `/api/image?key=${encodeURIComponent(a.imageKey)}`,
          createdAt: new Date(a.createdAt).getTime() || Date.now(),
          // Server stores `provider` as a top-level column (not inside the
          // params jsonb), so we merge it back here. Falls through to the
          // params.provider value if the column is empty (older rows).
          params: {
            ...DEFAULT_PARAMS,
            ...(a.params || {}),
            provider: a.provider || a.params?.provider || DEFAULT_PARAMS.provider,
          },
          finalPrompt: a.finalPrompt,
          seed: a.seed != null ? String(a.seed) : undefined,
          parentAssetId: a.parentAssetId ?? null,
          viewLabel: a.viewLabel || 'front',
          readyFor3D: a.readyFor3D !== false,   // default ON
          originalImageKey: a.originalImageKey ?? null,
        }));
        setImages(restored);
      } catch {
        /* offline-friendly: ignore, gallery just shows empty */
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  // Free in-flight object URLs on unmount (persisted /api/image URLs are fine
  // to leave; they're plain HTTP).
  useEffect(() => () => {
    images.forEach(i => { if (i.blob && i.url.startsWith('blob:')) URL.revokeObjectURL(i.url); });
  }, []);  // eslint-disable-line

  const onGenerate = useCallback(async () => {
    const q = prompt.trim();
    if (!q || generating) return;
    setGenerating(true);
    setError('');
    try {
      const px = ASPECT_PIXELS[params.aspect];
      const qs = new URLSearchParams({
        prompt:     q,
        w:          String(px.w),
        h:          String(px.h),
        bg:         params.bg,
        view:       params.view,
        projection: params.projection,
        scale:      params.scale,
        style:      params.style,
        material:   params.material,
        provider:   params.provider,
        strict_single: params.strictSingle ? '1' : '0',
      });
      // Pass the user's email so the server saves the image to R2 + DB.
      if (user?.email) qs.set('email', user.email);
      if (params.negative.trim()) qs.set('negative', params.negative.trim());

      const r = await fetch(`/api/text2image?${qs.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      if (blob.size === 0) throw new Error('empty response — try again');

      const finalPromptHdr = r.headers.get('X-Final-Prompt');
      const finalPrompt = finalPromptHdr ? decodeURIComponent(finalPromptHdr) : undefined;
      const seed = r.headers.get('X-Seed') || undefined;
      const serverAssetId = r.headers.get('X-Asset-Id') || '';
      const imageKeyHdr = r.headers.get('X-Image-Key');
      const imageKey = imageKeyHdr ? decodeURIComponent(imageKeyHdr) : '';

      idRef.current += 1;
      // Use the server-assigned asset id when available so future fetches
      // line up with the persisted row.
      const id = serverAssetId || `g${idRef.current}`;
      const url = URL.createObjectURL(blob);
      const next: GeneratedImage = {
        id, prompt: q, name: smartName(q), imageKey, blob, url, createdAt: Date.now(),
        params: { ...params },
        finalPrompt, seed,
      };
      setImages(prev => [next, ...prev]);
      setSelectedId(id);
    } catch (e: any) {
      setError(e.message || 'failed');
    } finally {
      setGenerating(false);
    }
  }, [prompt, params, generating, user?.email]);

  // Remove an image from the gallery — locally + persisted (server DELETE).
  // Falls back gracefully if the asset was never persisted (in-flight only).
  const onDeleteAsset = useCallback(async (id: string, name: string) => {
    const label = name?.trim() || 'this image';
    const ok = await confirm({
      title: `Delete ${label}?`,
      message: 'It will disappear from your gallery. Already-submitted 3D jobs that used this image are not affected.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      variant: 'danger',
    });
    if (!ok) return;
    setImages(prev => {
      const target = prev.find(i => i.id === id);
      if (target?.blob && target.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
      return prev.filter(i => i.id !== id);
    });
    setSelectedId(curr => curr === id ? null : curr);
    // Best-effort server delete. Non-persisted ids will 404, that's fine.
    fetch(`/api/text2image/assets/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  // Helper: get the bytes for a gallery item, fetching from R2 (via the proxy)
  // if the blob isn't already in memory (i.e. for items loaded on reload).
  const fetchAssetBlob = async (img: GeneratedImage): Promise<Blob> => {
    if (img.blob) return img.blob;
    const r = await fetch(`/api/image?key=${encodeURIComponent(img.imageKey)}`);
    if (!r.ok) throw new Error(`fetch image ${r.status}`);
    return await r.blob();
  };


  // (onSendTo3D removed — the user picks images via the Workspace filmstrip
  //  filtered by readyFor3D; we don't auto-push from here anymore.)

  const onDownload = useCallback(async () => {
    if (!selected) return;
    const blob = await fetchAssetBlob(selected);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selected.prompt.slice(0, 40).replace(/[^\w-]+/g, '_') || 'image'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [selected]);

  const commitName = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setImages(prev => prev.map(i => i.id === id ? { ...i, name: trimmed } : i));
    setEditingNameId(null);
    // Persist to server (best-effort — non-persisted ids will 404 silently)
    fetch(`/api/text2image/assets/${id}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => {});
  }, []);

  const onSignOut = async () => {
    await signOutUser();
    window.location.href = '/';
  };

  return (
    <Shell>
      {/* Top nav */}
      <NavBar>
        <BrandWrap to="/" title="Back to home">
          <BrandMark>⬡</BrandMark>
          GENSHAPE3D
        </BrandWrap>
        <NavSpacer />
        {isAuthenticated && (
          <RolePill $admin={isAdmin}>
            {isAdmin ? '⚙ Admin' : 'Free user'}
          </RolePill>
        )}
        {isAuthenticated ? (
          user?.photoURL
            ? <Avatar src={user.photoURL} alt="" onClick={onSignOut} title="Sign out" />
            : <AvatarFallback onClick={onSignOut} title="Sign out">{initials}</AvatarFallback>
        ) : null}
      </NavBar>

      <Body>
        {/* Icon rail */}
        <Rail>
          <RailItem icon="🖼" label="Image"  title="Image to 3D"
                    onClick={() => navigate('/dashboard')} />
          <RailItem icon="✨" label="Text"   active title="Text to image" />
          <RailItem icon="🎨" label="Texture" disabled title="Re-texture — coming soon" />
          <RailItem icon="🦴" label="Rig"     disabled title="Rig & animate — coming soon" />
          <RailDivider />
          <RailItem icon="📦" label="Assets"   title="My assets"
                    onClick={() => navigate('/dashboard')} />
          <RailItem icon="⚙" label="Settings" title="Settings" />
          {isAdmin && (
            <>
              <RailDivider />
              <RailItem icon="📊" label="Stats" title="Admin stats"
                        onClick={() => navigate('/admin/stats')} />
            </>
          )}
        </Rail>

        {/* Config */}
        <Panel>
          <PanelHeader><PanelTitle>Text to image</PanelTitle></PanelHeader>
          <PanelBody>
            <Field>
              <FieldLabel>
                Prompt
                <FieldHint>describe the object</FieldHint>
              </FieldLabel>
              <PromptArea
                placeholder="e.g. a small ceramic vase, smooth glaze"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onGenerate();
                }}
              />
              <ToggleRow
                onClick={() => setParam('strictSingle', !params.strictSingle)}
              >
                <ToggleSwitch $on={params.strictSingle}><ToggleKnob $on={params.strictSingle} /></ToggleSwitch>
                Force exactly one subject (no plurals / no groups)
              </ToggleRow>
            </Field>

            <SectionHeader>Composition</SectionHeader>

            <Field>
              <FieldLabel>Background</FieldLabel>
              <Segmented>
                {(['white','studio','black','iso'] as Background[]).map(v => (
                  <SegmentedBtn key={v} $active={params.bg === v} onClick={() => setParam('bg', v)}>
                    {BG_LABEL[v]}
                  </SegmentedBtn>
                ))}
              </Segmented>
            </Field>

            <Field>
              <FieldLabel>View</FieldLabel>
              <Segmented>
                {/*
                  Initial generation only exposes the 4 angles that make
                  sense as a STARTING image for 3D reconstruction. "back"
                  and "bottom" are still valid as ALT views (generated
                  from a primary later via the ImageController), but
                  starting with them produces poor models — a back-only
                  reference has no front information, etc.
                */}
                {(['front','three_q','side','top'] as ViewAngle[]).map(v => (
                  <SegmentedBtn key={v} $active={params.view === v} onClick={() => setParam('view', v)}>
                    {VIEW_LABEL[v]}
                  </SegmentedBtn>
                ))}
              </Segmented>
            </Field>

            <Field>
              <FieldLabel>Projection</FieldLabel>
              <Segmented>
                {(['perspective','isometric'] as Projection[]).map(v => (
                  <SegmentedBtn key={v} $active={params.projection === v} onClick={() => setParam('projection', v)}>
                    {PROJECTION_LABEL[v]}
                  </SegmentedBtn>
                ))}
              </Segmented>
            </Field>

            <Row>
              <Field>
                <FieldLabel>Scale</FieldLabel>
                <Dropdown<Scale>
                  value={params.scale}
                  onChange={v => setParam('scale', v)}
                  options={(Object.keys(SCALE_LABEL) as Scale[]).map(v => ({ value: v, label: SCALE_LABEL[v] }))}
                />
              </Field>
              <Field>
                <FieldLabel>Aspect</FieldLabel>
                <Dropdown<AspectRatio>
                  value={params.aspect}
                  onChange={v => setParam('aspect', v)}
                  options={(['1:1','4:3','3:4','16:9'] as AspectRatio[]).map(a => ({ value: a, label: a }))}
                />
              </Field>
            </Row>

            <SectionDivider />
            <SectionHeader>Look</SectionHeader>

            <Field>
              <FieldLabel>Style</FieldLabel>
              <Segmented>
                {(['photoreal','clay','neutral','toon'] as StyleKind[]).map(v => (
                  <SegmentedBtn key={v} $active={params.style === v} onClick={() => setParam('style', v)}>
                    {STYLE_LABEL[v]}
                  </SegmentedBtn>
                ))}
              </Segmented>
            </Field>

            <Field>
              <FieldLabel>Material</FieldLabel>
              <Dropdown<Material>
                value={params.material}
                onChange={v => setParam('material', v)}
                options={(Object.keys(MATERIAL_LABEL) as Material[]).map(v => ({ value: v, label: MATERIAL_LABEL[v] }))}
              />
            </Field>

            <SectionDivider />

            <Field>
              <FieldLabel>
                <span
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowAdvanced(s => !s)}
                >
                  {showAdvanced ? '▼' : '▶'} Advanced
                </span>
              </FieldLabel>
              {showAdvanced && (
                <>
                  <PromptArea
                    placeholder="Negative prompt — what to avoid"
                    value={params.negative}
                    onChange={e => setParam('negative', e.target.value)}
                    style={{ minHeight: 60 }}
                  />
                  <FieldHint>
                    A standard avoidance set is appended automatically (clutter, watermarks, blur).
                  </FieldHint>
                </>
              )}
            </Field>

          </PanelBody>

          <PanelFooter>
            {error && (
              <div style={{ fontSize: '0.74rem', color: '#EF4444' }}>{error} — try again.</div>
            )}
            <GenerateBtn
              $disabled={!prompt.trim() || generating}
              onClick={onGenerate}
            >
              {generating ? 'Generating image…' : '✨ Generate'}
            </GenerateBtn>
          </PanelFooter>
        </Panel>

        {/* Center */}
        <Viewport>
          <ViewportBar>
            <Dropdown<Provider>
              variant="pill"
              label="Provider"
              value={params.provider}
              onChange={v => setParam('provider', v)}
              width={260}
              options={(['fal-flux-schnell', 'fal-flux-pro', 'openai-dall-e-3', 'pollinations', 'hf-flux-schnell'] as Provider[])
                .map(p => ({
                  value: p,
                  label: PROVIDER_LABEL[p],
                  hint: (isAdmin ? PROVIDER_HINT_ADMIN : PROVIDER_HINT_USER)[p],
                  disabled: p === 'hf-flux-schnell',
                }))}
            />
            <VBHint>
              {(isAdmin ? PROVIDER_HINT_ADMIN : PROVIDER_HINT_USER)[params.provider]}
            </VBHint>
          </ViewportBar>

          {generating && (
            <RunningCard>
              <RunningSpinner />
              Generating…
            </RunningCard>
          )}
          <StageWrap>
            <Stage>
              {selected ? (
                <BigImage src={selected.url} alt={selected.prompt} />
              ) : (
                <EmptyState>
                  <EmptyTitle>
                    Describe what you <EmptyAccent>imagine</EmptyAccent>
                  </EmptyTitle>
                  <EmptySub>
                    Type a prompt on the left and we'll generate an image. You can fine-tune,
                    download, or send it straight to 3D.
                  </EmptySub>
                </EmptyState>
              )}
            </Stage>
            {/* Right-side tools rail — visible whenever an image is selected.
                Each entry opens its own modal / runs its own action. Keep
                the rail outside Stage so the BigImage stays centered in
                the remaining flex space. */}
            {selected && imageTools.length > 0 && (
              <ImageToolsRail tools={imageTools} />
            )}
          </StageWrap>

          <BgRemovalDialog
            open={bgEditOpen}
            // Fallback image (shown until the first preview arrives or
            // if the user has no asset id yet). Always the ORIGINAL.
            imageUrl={selected
              ? `/api/image?key=${encodeURIComponent(selected.originalImageKey || selected.imageKey)}`
              : undefined}
            // assetId + email enable the live-preview endpoint as the
            // user moves sliders.
            assetId={selected?.id}
            email={user?.email || undefined}
            hasEdit={!!selected?.originalImageKey}
            busy={bgEditBusy}
            onApply={onEditBackground}
            onRevert={onRevertBackground}
            onClose={() => !bgEditBusy && setBgEditOpen(false)}
          />

          {/* Persistent ImageController — lives BELOW StageWrap so the image
              area is unobstructed. Becomes the central control for the
              selected image: rename, download, regenerate, mark ready-for-3D,
              and add / pick / delete view angles. Hidden when nothing is
              selected. */}
          <ImageController
            visible={!!selected && !!selectedSections}
            image={toControlled(selected)}
            primaryImage={toControlled(primaryImage)}
            altViews={groupAltViews}
            busyViewLabels={busyViewLabels}
            prompt={selected?.prompt || ''}
            composedPrompt={selected?.finalPrompt}
            adminCostPerView={adminCostPerView}
            detailSections={selectedSections || []}
            onChangeName={onChangeSelectedName}
            onDownload={onDownload}
            onToggleReadyFor3D={onToggleReadyFor3D}
            onGenerateView={(label) => {
              if (!primaryImage) return;
              onGenerateAltView(primaryImage.id, label);
            }}
            onSelectView={(id) => setSelectedId(id)}
            onDeleteView={onDeleteAltView}
            onRegenerateView={(label, currentId) => {
              if (!primaryImage) return;
              onRegenerateAltView(primaryImage.id, label, currentId);
            }}
          />
        </Viewport>

        {/* Right rail — gallery with multi-select bulk-to-3D */}
        <Aside>
          <AsideHeader>
            <AsideTitle>My images</AsideTitle>
            <Search
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <AsideHint>
              {primaryImages.length === 0
                ? 'Your generations will appear here.'
                : `${primaryImages.length} image${primaryImages.length === 1 ? '' : 's'}`}
            </AsideHint>
          </AsideHeader>

          <AssetGrid>
            {primaryImages.length === 0 && (
              <EmptyAssets>
                <span style={{ fontSize: '1.4rem' }}>✨</span>
                Nothing yet — generate your first image.
              </EmptyAssets>
            )}
            {primaryImages
              .filter(img => !search.trim() || img.prompt.toLowerCase().includes(search.trim().toLowerCase()))
              .map(img => {
                const altViews = altViewsByParent.get(img.id) || [];
                const hasViews = altViews.length > 0;
                return (
                <AssetItem key={img.id}>
                  <AssetCard
                    $active={selectedId === img.id}
                    onClick={() => setSelectedId(img.id)}
                  >
                    <AssetThumb src={img.url} alt="" loading="lazy" decoding="async" />
                    {hasViews && <ViewsBadge>+{altViews.length} views</ViewsBadge>}
                    <DeleteBtn
                      type="button"
                      aria-label="Delete image"
                      onClick={(e) => { e.stopPropagation(); onDeleteAsset(img.id, img.name); }}
                    >
                      <IconClose size={13} />
                    </DeleteBtn>
                  </AssetCard>
                  {editingNameId === img.id ? (
                    <CardNameInput
                      autoFocus
                      value={nameDraft}
                      placeholder={img.name}
                      onChange={e => setNameDraft(e.target.value)}
                      onBlur={() => commitName(img.id, nameDraft || img.name)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitName(img.id, nameDraft || img.name);
                        if (e.key === 'Escape') setEditingNameId(null);
                        e.stopPropagation();
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <CardNameText
                      onDoubleClick={e => {
                        e.stopPropagation();
                        setEditingNameId(img.id);
                        setNameDraft(img.name);
                      }}
                      title="Double-click to rename"
                    >
                      {img.name}
                    </CardNameText>
                  )}
                </AssetItem>
                );
              })}
          </AssetGrid>
        </Aside>
      </Body>

    </Shell>
  );
};

export default TextToImage;
