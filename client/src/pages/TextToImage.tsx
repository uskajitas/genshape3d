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

// SessionStorage key used to hand a generated image to the Workspace page.
// (Workspace will need to read this on mount in a follow-up commit.)
export const PENDING_IMAGE_KEY = 'genshape3d.pendingTextImage';

// ─────────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────────

type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9';
type Background = 'white' | 'studio' | 'dark' | 'black' | 'iso';
type ViewAngle  = 'front' | 'three_q' | 'side' | 'iso';
type Scale      = 'fill' | 'margin';
type StyleKind  = 'photoreal' | 'clay' | 'neutral' | 'toon';
type Material   = 'auto' | 'ceramic' | 'metal' | 'wood' | 'plastic' | 'fabric' | 'glass' | 'stone';
type Provider   = 'pollinations' | 'fal-flux-schnell' | 'fal-flux-pro' | 'hf-flux-schnell' | 'openai-dall-e-3';

interface GenParams {
  bg: Background;
  view: ViewAngle;
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

const PROVIDER_HINT: Record<Provider, string> = {
  'pollinations':     'Free · slower when busy',
  'fal-flux-schnell': '~3s · ~$0.003/image · fast & high quality',
  'fal-flux-pro':     '~6s · ~$0.04/image · top-shelf quality',
  'hf-flux-schnell':  'Unavailable · service down',
  'openai-dall-e-3':  '~10s · ~$0.04/image · prompt-faithful',
};

const DEFAULT_PARAMS: GenParams = {
  bg: 'dark',
  view: 'front',
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

const BG_LABEL: Record<Background, string>     = { white: 'Plain white', studio: 'Studio grey', dark: 'Dark studio', black: 'Pure black', iso: 'Isolated' };
const VIEW_LABEL: Record<ViewAngle, string>    = { front: 'Front',       three_q: '3/4 front',  side: 'Side',         iso: 'Isometric' };
const SCALE_LABEL: Record<Scale, string>       = { fill: 'Fill frame',   margin: 'Centered + margin' };
const STYLE_LABEL: Record<StyleKind, string>   = { photoreal: 'Photoreal', clay: 'Clay render', neutral: 'Neutral matte', toon: 'Toon 3D' };
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
  background: ${p => p.theme.colors.background}80;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
`;

const SegmentedBtn = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 0.42rem 0.5rem;
  border: 0;
  border-radius: 7px;
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$active ? 'white' : p.theme.colors.text};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
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
const StageWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  position: relative;
  min-height: 0;
`;

const Stage = styled.div`
  position: relative;
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
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
const ActionBar = styled.div`
  position: absolute;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.5rem;
  background: ${p => p.theme.colors.surface}f2;
  backdrop-filter: blur(10px);
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 999px;
  padding: 0.4rem;
  box-shadow: 0 14px 40px rgba(0,0,0,0.5);
  z-index: 5;
`;

const ActionBtn = styled.button<{ $primary?: boolean }>`
  padding: 0.45rem 0.95rem;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.02em;
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$primary ? 'white' : p.theme.colors.text};
  &:hover {
    ${p => !p.$primary && `background: ${p.theme.colors.surfaceHigh};`}
    ${p => p.$primary && `filter: brightness(1.1);`}
  }
`;

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

// Per-card delete button (top-right, pairs with PickToggle in top-left).
const DeleteBtn = styled.button`
  position: absolute;
  top: 6px; right: 6px;
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 1.5px solid rgba(255,255,255,0.4);
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  color: white;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.14s, background 0.12s, border-color 0.12s;
  ${AssetItem}:hover & { opacity: 1; }
  &:hover {
    background: #EF4444cc;
    border-color: #EF4444;
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

// Portal tooltip bubble — rendered into document.body via ReactDOM.createPortal.
// position:fixed so it escapes any overflow:hidden ancestor.
// $side drives which edge the arrow appears on.
const TooltipBubble = styled.div<{ $side: 'left' | 'right' | 'top' }>`
  position: fixed;
  z-index: 9999;
  width: 224px;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => p.theme.colors.surface};
  box-shadow: 0 8px 28px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.35);
  color: ${p => p.theme.colors.text};
  font-size: 0.72rem;
  line-height: 1.55;
  font-weight: 400;
  letter-spacing: 0.01em;
  pointer-events: none;
  &::after {
    content: '';
    position: absolute;
    width: 10px; height: 10px;
    background: ${p => p.theme.colors.surface};
    border-top: 1px solid ${p => p.theme.colors.borderHigh};
    border-right: 1px solid ${p => p.theme.colors.borderHigh};
    /* left → arrow points right, sits on the right edge of bubble */
    ${p => p.$side === 'left'  && `right:-6px; top:50%; transform:translateY(-50%) rotate(45deg);`}
    /* right → arrow points left, sits on the left edge of bubble */
    ${p => p.$side === 'right' && `left:-6px;  top:50%; transform:translateY(-50%) rotate(225deg);`}
    /* top → arrow points down, sits on the bottom edge of bubble */
    ${p => p.$side === 'top'   && `bottom:-6px; left:50%; transform:translateX(-50%) rotate(135deg);`}
  }
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
  const [showDetails, setShowDetails] = useState(false);
  const idRef = useRef(0);

  // Multi-select state for the gallery — user picks N favorites then bulk-
  // submits them through the regular /api/upload flow.
  const [search, setSearch] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  // ── Portal tooltip state ────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<{
    content: string;
    x: number;
    y: number;
    side: 'left' | 'right' | 'top';
  } | null>(null);

  const TOOLTIP_W = 224; // must match TooltipBubble width
  const TOOLTIP_H = 90;  // conservative estimate for vertical clamping

  const showTooltip = useCallback((e: React.MouseEvent<HTMLDivElement>, content: string) => {
    const r   = e.currentTarget.getBoundingClientRect();
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    const GAP = 10;  // gap between card edge and bubble
    const PAD = 8;   // min distance from viewport edge

    // Prefer left — right-rail cards have plenty of canvas space to the left.
    if (r.left - TOOLTIP_W - GAP >= PAD) {
      const x = r.left - TOOLTIP_W - GAP;
      const y = Math.max(PAD, Math.min(r.top + r.height / 2 - TOOLTIP_H / 2, vh - TOOLTIP_H - PAD));
      setTooltip({ content, x, y, side: 'left' });
      return;
    }
    // Fall back to right (e.g. small viewports or left-rail cards in the future).
    if (r.right + TOOLTIP_W + GAP <= vw - PAD) {
      const x = r.right + GAP;
      const y = Math.max(PAD, Math.min(r.top + r.height / 2 - TOOLTIP_H / 2, vh - TOOLTIP_H - PAD));
      setTooltip({ content, x, y, side: 'right' });
      return;
    }
    // Last resort: above the card.
    const x = Math.max(PAD, Math.min(r.left + r.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - PAD));
    const y = Math.max(PAD, r.top - TOOLTIP_H - GAP);
    setTooltip({ content, x, y, side: 'top' });
  }, []);

  const hideTooltip = useCallback(() => setTooltip(null), []);
  // ────────────────────────────────────────────────────────────────────────

  // Tiny helper to update a single field of `params` immutably.
  const setParam = <K extends keyof GenParams>(k: K, v: GenParams[K]) =>
    setParams(p => ({ ...p, [k]: v }));

  const isAdmin = appUser?.role === 'admin';
  const initials = (user?.displayName || user?.email || '?').slice(0, 1).toUpperCase();

  const selected = useMemo<GeneratedImage | null>(
    () => images.find(i => i.id === selectedId) ?? null,
    [images, selectedId],
  );

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
          params: a.params || DEFAULT_PARAMS,
          finalPrompt: a.finalPrompt,
          seed: a.seed != null ? String(a.seed) : undefined,
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
        prompt:   q,
        w:        String(px.w),
        h:        String(px.h),
        bg:       params.bg,
        view:     params.view,
        scale:    params.scale,
        style:    params.style,
        material: params.material,
        provider: params.provider,
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
  const onDeleteAsset = useCallback((id: string) => {
    setImages(prev => {
      const target = prev.find(i => i.id === id);
      if (target?.blob && target.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
      return prev.filter(i => i.id !== id);
    });
    setSelectedSet(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
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


  const onSendTo3D = useCallback(async () => {
    if (!selected) return;
    const blob = await fetchAssetBlob(selected);
    const reader = new FileReader();
    reader.onloadend = () => {
      sessionStorage.setItem(PENDING_IMAGE_KEY, JSON.stringify({
        dataUrl: reader.result,
        name: selected.prompt.slice(0, 40),
      }));
      navigate('/dashboard');
    };
    reader.readAsDataURL(blob);
  }, [selected, navigate]);

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
                {(['white','studio','dark','black','iso'] as Background[]).map(v => (
                  <SegmentedBtn key={v} $active={params.bg === v} onClick={() => setParam('bg', v)}>
                    {BG_LABEL[v]}
                  </SegmentedBtn>
                ))}
              </Segmented>
            </Field>

            <Field>
              <FieldLabel>View</FieldLabel>
              <Segmented>
                {(['front','three_q','side','iso'] as ViewAngle[]).map(v => (
                  <SegmentedBtn key={v} $active={params.view === v} onClick={() => setParam('view', v)}>
                    {VIEW_LABEL[v]}
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
                .map(p => ({ value: p, label: PROVIDER_LABEL[p], hint: PROVIDER_HINT[p], disabled: p === 'hf-flux-schnell' }))}
            />
            <VBHint>{PROVIDER_HINT[params.provider]}</VBHint>
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
              <>
                <BigImage src={selected.url} alt={selected.prompt} />
                <ActionBar>
                  <ActionBtn $primary onClick={onSendTo3D}>↗ Send to 3D</ActionBtn>
                  <ActionBtn onClick={onDownload}>⬇ Download</ActionBtn>
                  <ActionBtn onClick={() => { setPrompt(selected.prompt); onGenerate(); }}>↻ Regenerate</ActionBtn>
                </ActionBar>
                {selected.finalPrompt && (
                  <div style={{
                    position: 'absolute',
                    top: 12, right: 12,
                    maxWidth: 360,
                    pointerEvents: 'auto',
                  }}>
                    <button
                      onClick={() => setShowDetails(s => !s)}
                      style={{
                        background: 'rgba(20,20,23,0.85)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid #2E2E34',
                        borderRadius: 999,
                        padding: '0.32rem 0.85rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: '#A4A4AC',
                        cursor: 'pointer',
                        marginLeft: 'auto',
                        display: 'block',
                      }}
                    >
                      {showDetails ? '× Hide details' : 'ⓘ Details'}
                    </button>
                    {showDetails && (
                      <div style={{
                        marginTop: 6,
                        background: 'rgba(20,20,23,0.92)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid #2E2E34',
                        borderRadius: 10,
                        padding: '0.6rem 0.75rem',
                        fontSize: '0.7rem',
                        lineHeight: 1.45,
                        color: '#A4A4AC',
                      }}>
                        <div style={{ fontWeight: 700, color: '#F4F4F6', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
                          Composed prompt
                        </div>
                        {selected.finalPrompt}
                        {selected.seed && <div style={{ marginTop: 6, opacity: 0.7 }}>seed: {selected.seed}</div>}
                      </div>
                    )}
                  </div>
                )}
              </>
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
          </StageWrap>
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
              {images.length === 0
                ? 'Your generations will appear here.'
                : `${images.length} image${images.length === 1 ? '' : 's'}`}
            </AsideHint>
          </AsideHeader>

          <AssetGrid>
            {images.length === 0 && (
              <EmptyAssets>
                <span style={{ fontSize: '1.4rem' }}>✨</span>
                Nothing yet — generate your first image.
              </EmptyAssets>
            )}
            {images
              .filter(img => !search.trim() || img.prompt.toLowerCase().includes(search.trim().toLowerCase()))
              .map(img => (
                <AssetItem
                  key={img.id}
                  onMouseEnter={e => showTooltip(e, img.prompt)}
                  onMouseLeave={hideTooltip}
                >
                  <AssetCard
                    $active={selectedId === img.id}
                    onClick={() => setSelectedId(img.id)}
                  >
                    <AssetThumb src={img.url} alt="" />
                    <DeleteBtn
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteAsset(img.id); }}
                      title="Delete"
                    >
                      ×
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
              ))}
          </AssetGrid>
        </Aside>
      </Body>

      {/* Portal tooltip — rendered into document.body, escapes all overflow:hidden ancestors */}
      {tooltip && ReactDOM.createPortal(
        <TooltipBubble
          $side={tooltip.side}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </TooltipBubble>,
        document.body,
      )}
    </Shell>
  );
};

export default TextToImage;
