// ─────────────────────────────────────────────────────────────────────────────
// Workspace — the GenShape3D app shell.
//
// Layout (Meshy / Tripo3D inspired):
//
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │ TOP NAV  logo · workspace · learn · ⓒ credits · Upgrade · 🔔 · 👤    │
//   ├──────┬──────────────────────────┬─────────────────────────┬──────────┤
//   │ ICON │  GENERATION CONFIG       │   CENTRAL VIEWPORT      │  ASSET   │
//   │ RAIL │  (image upload, options) │   (empty / mesh result) │  RAIL    │
//   │ 72px │  Width 320px             │   flex 1                │  320px   │
//   └──────┴──────────────────────────┴─────────────────────────┴──────────┘
//
// Both signed-in and anonymous users see this shell. Anonymous users get a
// "Sign in to generate" CTA in place of the Generate button — same as Meshy.
// ─────────────────────────────────────────────────────────────────────────────

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { useAppUser } from '../context/UserContext';
import { signOutUser } from '../firebase';

const MeshViewer = lazy(() => import('../components/MeshViewer'));

// ─────────────────────────────────────────────────────────────────────────────
// Types & API
// ─────────────────────────────────────────────────────────────────────────────

interface Job {
  id: string;
  name?: string;
  status: 'pending' | 'running' | 'processing' | 'done' | 'failed' | 'error' | 'cancelled';
  imageUrl?: string;
  resultUrl?: string;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  inferenceSteps?: number;
  octreeResolution?: number;
  targetFaceCount?: number;
  doTexture?: boolean;
  progressPct?: number;
  progressPhase?: string;
}

const fetchJobs = async (email: string): Promise<Job[]> => {
  const r = await fetch(`/api/jobs?email=${encodeURIComponent(email)}`);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : (data.jobs || []);
};

interface SubmitOpts {
  quality: 'standard' | 'high';
  doTexture: boolean;
}

const renameJob = async (id: string, name: string): Promise<void> => {
  await fetch(`/api/jobs/${id}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
};

const submitJob = async (email: string, file: File, opts: SubmitOpts): Promise<Job | null> => {
  const form = new FormData();
  form.append('image', file);
  form.append('email', email);
  // Default the asset name to the uploaded file's stem (no extension), so each
  // generated asset is labelled out of the gate. User can rename later.
  const stem = file.name.replace(/\.[^.]+$/, '');
  form.append('name', stem);
  form.append('exportFormat', 'GLB');
  // Map quality → Hunyuan params (matches worker.py's build_params).
  if (opts.quality === 'high') {
    form.append('inferenceSteps', '15');
    form.append('octreeResolution', '384');
    form.append('targetFaceCount', '100000');
    form.append('guidanceScale', '6');
  } else {
    form.append('inferenceSteps', '5');
    form.append('octreeResolution', '256');
    form.append('targetFaceCount', '30000');
    form.append('guidanceScale', '5');
  }
  form.append('doTexture', String(opts.doTexture));
  const r = await fetch('/api/upload', { method: 'POST', body: form });
  if (!r.ok) return null;
  const data: any = await r.json();
  return data.job ?? data;
};

// ─────────────────────────────────────────────────────────────────────────────
// Animations
// ─────────────────────────────────────────────────────────────────────────────

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.04); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50%      { transform: translateY(-12px) rotate(2deg); }
`;

const rotate = keyframes`
  from { transform: rotate(0deg); } to { transform: rotate(360deg); }
`;

const sweep = keyframes`
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Shell scaffold
// ─────────────────────────────────────────────────────────────────────────────

const Shell = styled.div`
  display: grid;
  grid-template-rows: 56px 1fr;
  height: 100vh;
  width: 100%;
  max-width: 100vw;
  overflow-x: hidden;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, ${p => p.theme.colors.primary}14, transparent 60%),
    radial-gradient(ellipse 60% 40% at 100% 100%, ${p => p.theme.colors.violet}10, transparent 60%),
    ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
`;

const Body = styled.div`
  display: grid;
  grid-template-columns: 64px 320px 1fr 320px;
  min-height: 0;
  overflow: hidden;

  @media (max-width: 1280px) {
    grid-template-columns: 64px 300px 1fr 280px;
  }
  @media (max-width: 1024px) {
    grid-template-columns: 56px 280px 1fr;
  }
  @media (max-width: 720px) {
    grid-template-columns: 56px 1fr;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Top nav
// ─────────────────────────────────────────────────────────────────────────────

const NavBar = styled.header`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem 0 1.25rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background:
    linear-gradient(180deg, ${p => p.theme.colors.surfaceHigh}, ${p => p.theme.colors.surface});
  backdrop-filter: blur(8px);
  z-index: 10;
`;

const BrandWrap = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  font-size: 0.95rem;
  color: ${p => p.theme.colors.text};
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.12s;
  &:hover { opacity: 0.85; }
`;

const BrandMark = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 14px ${p => p.theme.colors.primary}66;
  font-size: 0.95rem;
`;

const NavTabs = styled.nav`
  display: flex;
  gap: 0.25rem;
  margin-left: 1.5rem;

  @media (max-width: 720px) { display: none; }
`;

const NavTab = styled.button<{ $active?: boolean }>`
  background: none;
  border: 0;
  font: inherit;
  cursor: pointer;
  padding: 0.4rem 0.75rem;
  border-radius: 7px;
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  font-size: 0.85rem;
  font-weight: 500;
  transition: color 0.15s, background 0.15s;
  &:hover {
    color: ${p => p.theme.colors.text};
    background: ${p => p.theme.colors.surfaceHigh};
  }
`;

const NavSpacer = styled.div`
  flex: 1;
`;

const CreditPill = styled.button<{ $admin?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font: inherit;
  cursor: default;
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

const CoinDot = styled.span`
  width: 14px; height: 14px; border-radius: 50%;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  box-shadow: 0 0 8px ${p => p.theme.colors.violet}99;
`;

const UpgradeBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font: inherit;
  cursor: pointer;
  padding: 0.42rem 1rem;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 14px ${p => p.theme.colors.primary}55;
  transition: transform 0.12s, box-shadow 0.12s;
  &:hover { transform: translateY(-1px); box-shadow: 0 4px 22px ${p => p.theme.colors.violet}88; }
  &::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%);
    animation: ${sweep} 2.6s linear infinite;
  }
`;

const ProfileBtn = styled.button`
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  &:hover { border-color: ${p => p.theme.colors.violet}; }
`;

const ProfileImg = styled.img`
  width: 32px; height: 32px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
`;

const SignInBtn = styled.button`
  font: inherit;
  cursor: pointer;
  padding: 0.42rem 1rem;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: transparent;
  color: ${p => p.theme.colors.text};
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  &:hover { background: ${p => p.theme.colors.surfaceHigh}; border-color: ${p => p.theme.colors.violet}; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Icon rail (left)
// ─────────────────────────────────────────────────────────────────────────────

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
  border: 1px solid ${p => p.$active ? 'transparent' : 'transparent'};
  opacity: ${p => p.$disabled ? 0.4 : 1};
  position: relative;
  transition: background 0.15s, color 0.15s, transform 0.12s;
  ${p => p.$active && `box-shadow: 0 4px 18px ${p.theme.colors.primary}66;`}
  &:hover {
    ${p => !p.$disabled && !p.$active && `
      background: ${p.theme.colors.surfaceHigh};
    `}
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
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}> = ({ icon, label, active, disabled, onClick, title }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <RailBtn
      $active={active}
      $disabled={disabled}
      onClick={disabled ? undefined : onClick}
      title={title || label}
    >
      {icon}
    </RailBtn>
    <RailLabel>{label}</RailLabel>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Config panel (left middle) — image upload + minimal options
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
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const DropZone = styled.label<{ $hasFile?: boolean; $dragOver?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 1.5px dashed ${p =>
    p.$dragOver ? p.theme.colors.violet :
    p.$hasFile ? p.theme.colors.primary :
    p.theme.colors.borderHigh};
  border-radius: 14px;
  padding: ${p => p.$hasFile ? '0' : '1.75rem 1rem'};
  background: ${p => p.$hasFile ? 'transparent' : p.theme.colors.background}99;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
  overflow: hidden;
  aspect-ratio: ${p => p.$hasFile ? '1' : 'auto'};
  &:hover { border-color: ${p => p.theme.colors.violet}; }
`;

const DropZoneIcon = styled.div`
  width: 48px; height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}22, ${p => p.theme.colors.violet}22);
  border: 1px solid ${p => p.theme.colors.primary}44;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.25rem;
`;

const DropZoneText = styled.div`
  font-size: 0.85rem;
  color: ${p => p.theme.colors.text};
  font-weight: 600;
  text-align: center;
`;

const DropZoneHint = styled.div`
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
  text-align: center;
`;

const PreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const PreviewClear = styled.button`
  position: absolute;
  top: 8px; right: 8px;
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 0;
  background: rgba(0,0,0,0.65);
  color: white;
  cursor: pointer;
  font-size: 0.85rem;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: rgba(0,0,0,0.85); }
`;

const HiddenInput = styled.input`
  position: absolute;
  width: 1px; height: 1px; opacity: 0;
  pointer-events: none;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
`;

const FieldLabel = styled.label`
  font-size: 0.72rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const FieldHint = styled.span`
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: ${p => p.theme.colors.textMuted};
  opacity: 0.75;
`;

const Segmented = styled.div`
  display: flex;
  background: ${p => p.theme.colors.background}80;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
`;

const SegmentedBtn = styled.button<{ $active?: boolean; $disabled?: boolean }>`
  flex: 1;
  padding: 0.42rem 0.5rem;
  border: 0;
  border-radius: 7px;
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$active ? 'white' : p.$disabled ? p.theme.colors.textMuted : p.theme.colors.text};
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  opacity: ${p => p.$disabled ? 0.55 : 1};
  transition: background 0.15s, color 0.15s;
  ${p => p.$active && `box-shadow: 0 2px 8px ${p.theme.colors.primary}66;`}
`;


// ── Gallery filmstrip ─────────────────────────────────────────────────────────
// Horizontal scrolling strip of small thumbnails at the top of the panel.

const Filmstrip = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem 1rem;
  overflow-x: auto;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background}88;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
  flex-shrink: 0;
`;

const FilmThumb = styled.button`
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 7px;
  border: 1.5px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  position: relative;
  transition: border-color 0.12s, transform 0.1s, box-shadow 0.12s;
  &:hover {
    border-color: ${p => p.theme.colors.violet};
    transform: translateY(-1px);
    box-shadow: 0 4px 12px ${p => p.theme.colors.violet}55;
  }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
`;

const FilmThumbName = styled.div`
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 0.7rem 0.2rem 0.18rem;
  background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
  font-size: 0.5rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  opacity: 0;
  transition: opacity 0.15s;
  ${FilmThumb}:hover & { opacity: 1; }
`;

const FilmEmpty = styled.div`
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
  white-space: nowrap;
  padding: 0 0.25rem;
`;

const FilmstripWrap = styled.div`
  position: relative;
  flex-shrink: 0;
  &:hover .film-arrow { opacity: 1; }
`;

const FilmArrow = styled.button<{ $dir: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  ${p => p.$dir === 'left' ? 'left: 4px;' : 'right: 4px;'}
  z-index: 5;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => p.theme.colors.surface}ee;
  backdrop-filter: blur(6px);
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.55rem;
  opacity: 0;
  transition: opacity 0.15s, color 0.12s, border-color 0.12s;
  &:hover {
    color: ${p => p.theme.colors.text};
    border-color: ${p => p.theme.colors.violet};
  }
`;

const ComingSoonTag = styled.span`
  font-size: 0.6rem;
  color: ${p => p.theme.colors.violet};
  background: ${p => p.theme.colors.violet}22;
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 0.35rem;
  font-weight: 700;
  letter-spacing: 0.05em;
`;

const PromptArea = styled.textarea`
  width: 100%;
  min-height: 72px;
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

const PanelFooter = styled.div`
  border-top: 1px solid ${p => p.theme.colors.border};
  padding: 0.85rem 1rem 1rem;
  background: ${p => p.theme.colors.surface};
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
`;

const CostRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
`;

const CostValue = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: ${p => p.theme.colors.text};
  font-weight: 600;
`;

const GenerateBtn = styled.button<{ $disabled?: boolean }>`
  width: 100%;
  padding: 0.85rem 1rem;
  border: 0;
  border-radius: 12px;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  position: relative;
  overflow: hidden;
  transition: transform 0.12s, box-shadow 0.12s;
  background: ${p => p.$disabled
    ? p.theme.colors.surfaceHigh
    : `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`};
  color: ${p => p.$disabled ? p.theme.colors.textMuted : 'white'};
  box-shadow: ${p => p.$disabled ? 'none' : `0 6px 22px ${p.theme.colors.primary}66`};
  &:hover {
    ${p => !p.$disabled && `
      transform: translateY(-1px);
      box-shadow: 0 8px 30px ${p.theme.colors.violet}88;
    `}
  }
  &:disabled { pointer-events: none; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Central viewport
// ─────────────────────────────────────────────────────────────────────────────

const Viewport = styled.section`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse 60% 60% at 30% 25%, ${p => p.theme.colors.primary}26, transparent 60%),
    radial-gradient(ellipse 55% 55% at 75% 80%, ${p => p.theme.colors.violet}1f, transparent 60%),
    radial-gradient(ellipse 100% 100% at 50% 50%, ${p => p.theme.colors.surface}, ${p => p.theme.colors.background});
  overflow: hidden;
  min-width: 0;
`;

const GridBg = styled.div`
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(${p => p.theme.colors.border}66 1px, transparent 1px),
    linear-gradient(90deg, ${p => p.theme.colors.border}66 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.25;
  pointer-events: none;
  mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  text-align: center;
  z-index: 1;
  animation: ${fadeIn} 0.35s ease;
  padding: 0 2rem;
  max-width: 480px;
`;

const HeroOrb = styled.div`
  position: relative;
  width: 140px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const HeroCore = styled.div`
  width: 80px; height: 80px;
  border-radius: 26%;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  box-shadow:
    0 10px 40px ${p => p.theme.colors.primary}66,
    inset 0 -10px 30px ${p => p.theme.colors.violet}aa;
  animation: ${float} 6s ease-in-out infinite;
`;

const HeroRing = styled.div<{ $size: number; $delay?: number; $color?: string }>`
  position: absolute;
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  border-radius: 50%;
  border: 1px dashed ${p => p.$color || p.theme.colors.violet}66;
  animation: ${rotate} ${p => 12 + p.$size / 30}s linear infinite ${p => p.$delay ? `${p.$delay}s` : ''};
`;

const HeroDot = styled.div<{ $top: number; $left: number; $color?: string }>`
  position: absolute;
  top: ${p => p.$top}%;
  left: ${p => p.$left}%;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: ${p => p.$color || p.theme.colors.primary};
  box-shadow: 0 0 12px ${p => p.$color || p.theme.colors.primary};
  animation: ${pulse} 2.4s ease infinite;
`;

const EmptyTitle = styled.h1`
  font-family: 'Space Grotesk', 'Inter', sans-serif;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: ${p => p.theme.colors.text};
`;

const EmptyTitleAccent = styled.span`
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

const EmptyCta = styled.button`
  margin-top: 0.5rem;
  padding: 0.7rem 1.5rem;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 22px ${p => p.theme.colors.primary}66;
  transition: transform 0.12s, box-shadow 0.12s;
  &:hover { transform: translateY(-1px); box-shadow: 0 8px 30px ${p => p.theme.colors.violet}88; }
`;

const ViewerWrap = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
`;

// Floating overlay status card while a job is running
const RunningCard = styled.div`
  position: absolute;
  top: 16px; left: 50%;
  transform: translateX(-50%);
  background: ${p => p.theme.colors.surface}f2;
  backdrop-filter: blur(10px);
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 12px;
  padding: 0.6rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  z-index: 5;
  font-size: 0.82rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text};
  box-shadow: 0 14px 40px rgba(0,0,0,0.4);
`;

const RunningSpinner = styled.div`
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 2px solid ${p => p.theme.colors.violet}33;
  border-top-color: ${p => p.theme.colors.violet};
  animation: ${rotate} 0.9s linear infinite;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Asset rail (right)
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

const AssetTabs = styled.div`
  display: flex;
  gap: 0.2rem;
`;

const AssetTabBtn = styled.button<{ $active?: boolean }>`
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.28rem 0.6rem;
  border-radius: 6px;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : 'transparent'};
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}33, ${p.theme.colors.violet}33)`
    : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  cursor: pointer;
  transition: all 0.12s;
  &:hover { color: ${p => p.theme.colors.text}; border-color: ${p => p.theme.colors.borderHigh}; }
`;

const CancelJobBtn = styled.button`
  position: absolute;
  top: 5px; right: 5px;
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(239,68,68,0.5);
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
  color: #EF4444;
  font-size: 0.7rem;
  font-weight: 800;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 0.14s, background 0.12s;
  z-index: 3;
  &:hover { background: #EF4444; color: white; }
`;

const AssetGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.85rem 1rem 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  align-content: start;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
`;

// Outer wrapper holding the thumbnail card + the editable name underneath.
const AssetItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const AssetCard = styled.button<{ $active?: boolean }>`
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  border: 1.5px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
  &:hover {
    transform: translateY(-2px);
    border-color: ${p => p.theme.colors.violet};
    box-shadow: 0 6px 20px ${p => p.theme.colors.violet}44;
  }
  &:hover .asset-overlay { opacity: 1; }
  &:hover .cancel-btn    { opacity: 1; }
`;

const AssetName = styled.div<{ $empty?: boolean }>`
  font-size: 0.72rem;
  color: ${p => p.$empty ? p.theme.colors.textMuted : p.theme.colors.text};
  font-style: ${p => p.$empty ? 'italic' : 'normal'};
  font-weight: ${p => p.$empty ? 400 : 600};
  padding: 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
  &:hover { color: ${p => p.theme.colors.violet}; }
`;

const AssetNameInput = styled.input`
  width: 100%;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 1px 4px;
  border: 1px solid ${p => p.theme.colors.violet};
  border-radius: 4px;
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  outline: none;
`;

// Overlay strip pinned to the bottom of the thumb. Hidden by default,
// fades in on card hover so resting view stays clean.
const AssetOverlay = styled.div`
  position: absolute;
  left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.5rem;
  background: linear-gradient(to top, rgba(10,10,12,0.92), rgba(10,10,12,0.45) 70%, transparent);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease;
`;

const AssetTag = styled.span<{ $color?: string }>`
  display: inline-flex;
  align-items: center;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.48rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: ${p => p.$color ? `${p.$color}40` : 'rgba(255,255,255,0.15)'};
  color: ${p => p.$color || '#fff'};
  border: 1px solid ${p => p.$color || 'rgba(255,255,255,0.3)'};
  backdrop-filter: blur(4px);
`;

const AssetTime = styled.span`
  margin-left: auto;
  font-weight: 700;
  font-size: 0.54rem;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
`;

const AssetThumb = styled.img`
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
`;

const AssetPlaceholder = styled.div`
  width: 100%; height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(135deg, ${p => p.theme.colors.primary}22, ${p => p.theme.colors.violet}22);
  font-size: 1.5rem;
`;

// Tiny "pick thumbnail" button that appears on hover — bottom-right corner.
// Lets the user re-link an asset's input image when the auto-pairing was wrong
// (e.g. recovered jobs from R2 orphans).
// Modal: pick which R2 upload should be the asset's thumbnail.

const AssetBadge = styled.div<{ $color: string }>`
  position: absolute;
  top: 6px; left: 6px;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: ${p => p.$color}cc;
  color: white;
  backdrop-filter: blur(6px);
`;

// Meta strip under the thumb — shows what's *different* between cards (quality,
// texture flag, run time) so duplicate inputs aren't visually indistinguishable.
const EmptyAssets = styled.div`
  grid-column: 1 / -1;
  text-align: center;
  font-size: 0.82rem;
  color: ${p => p.theme.colors.textMuted};
  padding: 2rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const HeroIllustration: React.FC = () => (
  <HeroOrb>
    <HeroRing $size={140} />
    <HeroRing $size={108} $delay={-3} $color="#EC4899" />
    <HeroCore />
    <HeroDot $top={5} $left={48} />
    <HeroDot $top={50} $left={92} $color="#EC4899" />
    <HeroDot $top={92} $left={48} />
    <HeroDot $top={50} $left={4} $color="#EC4899" />
  </HeroOrb>
);

const Workspace: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { appUser } = useAppUser();

  // ── State
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [doTexture, setDoTexture] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [assetTab, setAssetTab] = useState<'all' | 'pending' | 'done' | 'cancelled'>('all');
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [limits, setLimits] = useState<{ used24h: number; limit24h: number | null } | null>(null);

  // Gallery images fetched from the text-to-image page — shown in the panel
  // so the user can pick one as the input without re-uploading.
  const [gallery, setGallery] = useState<{ id: string; imageKey: string; name: string; prompt: string }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [loadingFromGallery, setLoadingFromGallery] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  // Convert vertical wheel scroll to horizontal so the filmstrip scrolls
  // naturally with a regular mouse wheel.
  useEffect(() => {
    const el = filmstripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const email = user?.email || '';
  const isAdmin = appUser?.role === 'admin';
  // Non-admins are pinned to Standard / no-texture while we're on the GTX 1080.
  const effectiveQuality = isAdmin ? quality : 'standard';
  const effectiveTexture = isAdmin ? doTexture : false;

  // ── Effects
  // Initial load + steady poll every 5s. Cheap (single GET, small JSON) and
  // means new jobs from anywhere (e.g. the benchmark harness) appear in the
  // asset rail without a manual refresh.
  useEffect(() => {
    if (!isAuthenticated || !email) return;
    let cancelled = false;
    const tick = async () => {
      const [j, l] = await Promise.all([
        fetchJobs(email),
        fetch(`/api/limits?email=${encodeURIComponent(email)}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ]);
      if (cancelled) return;
      setJobs(j);
      if (l) setLimits({ used24h: l.used24h, limit24h: l.limit24h });
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isAuthenticated, email]);

  // Fetch the user's text-to-image gallery on mount so the panel picker is ready.
  useEffect(() => {
    if (!isAuthenticated || !email) return;
    setGalleryLoading(true);
    fetch(`/api/text2image/assets?email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => setGallery((d.assets || []).map((a: any) => ({
        id: a.id, imageKey: a.imageKey,
        name: a.name || a.prompt.slice(0, 32),
        prompt: a.prompt,
      }))))
      .catch(() => {})
      .finally(() => setGalleryLoading(false));
  }, [isAuthenticated, email]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Pick an image from the gallery: fetch its bytes from R2 via the proxy,
  // turn it into a File, and load it exactly like a manual upload.
  const onPickFromGallery = useCallback(async (img: { imageKey: string; name: string; prompt: string }) => {
    if (loadingFromGallery) return;
    setLoadingFromGallery(true);
    try {
      const r = await fetch(`/api/image?key=${encodeURIComponent(img.imageKey)}`);
      if (!r.ok) throw new Error(`fetch ${r.status}`);
      const blob = await r.blob();
      const safeName = img.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'image';
      const f = new File([blob], `${safeName}.png`, { type: blob.type || 'image/png' });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    } catch { /* ignore */ }
    finally { setLoadingFromGallery(false); }
  }, [loadingFromGallery, previewUrl]);

  // ── Handlers
  const onFile = useCallback((f: File | undefined) => {
    if (!f || !f.type.startsWith('image/')) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }, [previewUrl]);

  const onClearFile = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [previewUrl]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onFile(e.dataTransfer.files?.[0]);
  };

  const onGenerate = useCallback(async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!file || !email || submitting) return;
    setSubmitting(true);
    const job = await submitJob(email, file, {
      quality: effectiveQuality,
      doTexture: effectiveTexture,
    });
    setSubmitting(false);
    if (job) {
      setJobs(prev => [job, ...prev]);
      setSelectedJobId(job.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
    }
  }, [isAuthenticated, navigate, file, email, submitting, previewUrl, effectiveQuality, effectiveTexture]);


  const onCancelJob = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/jobs/${id}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'cancelled' } : j));
  }, [email]);

  const onSignOut = async () => {
    await signOutUser();
    window.location.href = '/';
  };

  // ── Derived
  const selectedJob = useMemo(
    () => jobs.find(j => j.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  // Prefer the currently-processing job over any pending ones, otherwise the
  // overlay flips to a freshly-queued pending job (0%) while the actual
  // running job is at 90%. That's confusing.
  const runningJob = useMemo(
    () =>
      jobs.find(j => j.status === 'processing' || j.status === 'running')
      ?? jobs.find(j => j.status === 'pending')
      ?? null,
    [jobs],
  );

  // Queue position map — pending jobs sorted oldest-first (worker order).
  // { [jobId]: 1-based position } used to show "#N" on the badge without hover.
  const queuePos = useMemo(() => {
    const pending = [...jobs]
      .filter(j => j.status === 'pending')
      .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    return Object.fromEntries(pending.map((j, i) => [j.id, i + 1]));
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    let list = assetTab === 'all' ? jobs : jobs.filter(j => j.status === assetTab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(j => (j.name || j.id).toLowerCase().includes(q));
    // Processing/running jobs always surface first, regardless of tab or search order.
    return [...list].sort((a, b) => {
      const isActive = (s: string) => s === 'processing' || s === 'running' ? 0 : 1;
      return isActive(a.status) - isActive(b.status);
    });
  }, [jobs, search, assetTab]);

  const meshUrl = selectedJob?.resultUrl
    ? `/api/mesh?key=${encodeURIComponent(selectedJob.resultUrl)}`
    : null;

  const initials = (user?.displayName || user?.email || '?').slice(0, 1).toUpperCase();

  // ── Render
  return (
    <Shell>
      {/* ──────── Top nav ──────── */}
      <NavBar>
        <BrandWrap to="/" title="Back to home">
          <BrandMark>⬡</BrandMark>
          GENSHAPE3D
        </BrandWrap>
        <NavTabs>
          <NavTab $active>Workspace</NavTab>
          <NavTab onClick={() => navigate('/#how')}>How it works</NavTab>
          <NavTab onClick={() => navigate('/#access')}>Free access</NavTab>
        </NavTabs>
        <NavSpacer />
        {isAuthenticated && (
          <CreditPill
            $admin={isAdmin}
            title={isAdmin ? 'Admin — full access to all settings' : 'Free user — Standard quality only during early access'}
          >
            <CoinDot />
            {isAdmin ? '⚙ Admin' : 'Free user'}
          </CreditPill>
        )}
        {isAuthenticated ? (
          user?.photoURL
            ? <ProfileImg src={user.photoURL} alt={user.displayName || 'Profile'} onClick={onSignOut} title="Sign out" />
            : <ProfileBtn onClick={onSignOut} title="Sign out">{initials}</ProfileBtn>
        ) : (
          <SignInBtn onClick={() => navigate('/login')}>Sign in</SignInBtn>
        )}
      </NavBar>

      <Body>
        {/* ──────── Icon rail ──────── */}
        <Rail>
          <RailItem icon="🖼" label="Image" active title="Image to 3D" />
          <RailItem icon="✨" label="Text" title="Text to image"
                    onClick={() => navigate('/dashboard/text')} />
          <RailItem icon="🎨" label="Texture" disabled title="Re-texture — coming soon" />
          <RailItem icon="🦴" label="Rig" disabled title="Rig & animate — coming soon" />
          <RailDivider />
          <RailItem icon="📦" label="Assets" title="My assets" />
          <RailItem icon="⚙" label="Settings" title="Settings" />
          {isAdmin && (
            <>
              <RailDivider />
              <RailItem
                icon="📊"
                label="Stats"
                title="Admin stats"
                onClick={() => navigate('/admin/stats')}
              />
            </>
          )}
        </Rail>

        {/* ──────── Config panel ──────── */}
        <Panel>
          <PanelHeader>
            <PanelTitle>Image to 3D</PanelTitle>
            <FieldHint
              style={{ cursor: 'pointer', fontSize: '0.72rem' }}
              onClick={() => navigate('/dashboard/text')}
              title="Go to Text to Image"
            >
              ✨ Create images
            </FieldHint>
          </PanelHeader>

          {/* Filmstrip — user's text-to-image gallery as horizontal thumbnails */}
          <FilmstripWrap>
            <FilmArrow
              className="film-arrow"
              $dir="left"
              onClick={() => filmstripRef.current && (filmstripRef.current.scrollLeft -= 160)}
              title="Scroll left"
            >◀</FilmArrow>
            <Filmstrip ref={filmstripRef}>
              {!isAuthenticated ? (
                <FilmEmpty>Sign in to see your images</FilmEmpty>
              ) : galleryLoading ? (
                <FilmEmpty>Loading…</FilmEmpty>
              ) : gallery.length === 0 ? (
                <FilmEmpty>No images yet — generate some ✨</FilmEmpty>
              ) : gallery.map(img => (
                <FilmThumb
                  key={img.id}
                  title={img.name}
                  onClick={() => onPickFromGallery(img)}
                >
                  <img src={`/api/image?key=${encodeURIComponent(img.imageKey)}`} alt={img.name} />
                  <FilmThumbName>{img.name}</FilmThumbName>
                </FilmThumb>
              ))}
            </Filmstrip>
            <FilmArrow
              className="film-arrow"
              $dir="right"
              onClick={() => filmstripRef.current && (filmstripRef.current.scrollLeft += 160)}
              title="Scroll right"
            >▶</FilmArrow>
          </FilmstripWrap>

          <PanelBody>
            <Field>
              <FieldLabel>
                Reference image
                <FieldHint>{file ? file.name.slice(0, 24) : 'PNG · JPG · WEBP'}</FieldHint>
              </FieldLabel>
              <DropZone
                $hasFile={!!previewUrl}
                $dragOver={dragOver}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <HiddenInput
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                {previewUrl ? (
                  <>
                    <PreviewImage src={previewUrl} alt="upload preview" />
                    <PreviewClear onClick={onClearFile} title="Remove">×</PreviewClear>
                  </>
                ) : (
                  <>
                    <DropZoneIcon>⬆</DropZoneIcon>
                    <DropZoneText>Drop or click to upload</DropZoneText>
                    <DropZoneHint>Front-facing single object · max 20MB</DropZoneHint>
                  </>
                )}
              </DropZone>
            </Field>


            <Field>
              <FieldLabel>Prompt <FieldHint>optional — guide the 3D model</FieldHint></FieldLabel>
              <PromptArea
                placeholder="e.g. ceramic surface, no handles, smooth"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel>
                Quality
                {!isAdmin && <FieldHint>Standard only — free tier</FieldHint>}
              </FieldLabel>
              <Segmented>
                <SegmentedBtn
                  $active={effectiveQuality === 'standard'}
                  onClick={() => isAdmin && setQuality('standard')}
                >
                  Standard
                </SegmentedBtn>
                <SegmentedBtn
                  $active={isAdmin && quality === 'high'}
                  $disabled={!isAdmin}
                  onClick={() => isAdmin && setQuality('high')}
                >
                  High {!isAdmin && <ComingSoonTag>admin</ComingSoonTag>}
                </SegmentedBtn>
              </Segmented>
            </Field>

            {isAdmin && (
              <Field>
                <FieldLabel>Texture <FieldHint>admin only</FieldHint></FieldLabel>
                <Segmented>
                  <SegmentedBtn $active={!doTexture} onClick={() => setDoTexture(false)}>Off</SegmentedBtn>
                  <SegmentedBtn $active={doTexture} onClick={() => setDoTexture(true)}>On</SegmentedBtn>
                </Segmented>
              </Field>
            )}

            <Field>
              <FieldLabel>Format</FieldLabel>
              <Segmented>
                <SegmentedBtn $active>GLB</SegmentedBtn>
                <SegmentedBtn $disabled>OBJ <ComingSoonTag>soon</ComingSoonTag></SegmentedBtn>
                <SegmentedBtn $disabled>FBX <ComingSoonTag>soon</ComingSoonTag></SegmentedBtn>
              </Segmented>
            </Field>
          </PanelBody>
          <PanelFooter>
            <CostRow>
              <span>Expected wait</span>
              <CostValue>
                ⏱{' '}
                {effectiveQuality === 'high'
                  ? (effectiveTexture ? '~45 min' : '~30-200 min')
                  : (effectiveTexture ? '~15 min' : '~5 min')}
              </CostValue>
            </CostRow>
            {!isAdmin && limits && limits.limit24h !== null && (
              <CostRow>
                <span>Daily usage</span>
                <CostValue>
                  {limits.used24h}/{limits.limit24h} in last 24h
                </CostValue>
              </CostRow>
            )}
            {!isAdmin && (
              <CostRow>
                <span style={{ fontSize: '0.74rem', lineHeight: 1.45 }}>
                  Free during early access. Generation runs on a shared queue — wait time scales with load.
                </span>
              </CostRow>
            )}
            <GenerateBtn
              $disabled={
                !isAuthenticated
                  ? false
                  : (!file || submitting ||
                     (!isAdmin && !!limits && limits.limit24h !== null && limits.used24h >= limits.limit24h))
              }
              onClick={onGenerate}
            >
              {!isAuthenticated
                ? '✦ Sign in to generate'
                : submitting
                  ? 'Submitting…'
                  : !file
                    ? 'Upload an image first'
                    : (!isAdmin && limits && limits.limit24h !== null && limits.used24h >= limits.limit24h)
                      ? 'Daily limit reached — try again later'
                      : '✦ Generate (free)'}
            </GenerateBtn>
          </PanelFooter>
        </Panel>

        {/* ──────── Central viewport ──────── */}
        <Viewport>
          <GridBg />
          {/*
            Only show the floating "Generating mesh…" overlay if either:
            - the user has selected the running job, or
            - nothing is selected yet (so the overlay sits on the empty state).
            When the user clicks an older finished asset, we let them inspect
            it without a misleading "generating" badge over the viewer.
          */}
          {runningJob && (selectedJobId === runningJob.id || !selectedJob) && (
            <RunningCard>
              <RunningSpinner />
              Generating mesh… {runningJob.progressPct ?? 0}%
            </RunningCard>
          )}
          {meshUrl ? (
            <ViewerWrap>
              <Suspense fallback={<EmptyState><EmptySub>Loading viewer…</EmptySub></EmptyState>}>
                <MeshViewer url={meshUrl} wireframe={false} showGrid />
              </Suspense>
            </ViewerWrap>
          ) : (
            <EmptyState>
              <HeroIllustration />
              <EmptyTitle>
                What will you <EmptyTitleAccent>shape</EmptyTitleAccent> today?
              </EmptyTitle>
              <EmptySub>
                Upload an image on the left to turn it into an export-ready 3D model.
                {!isAuthenticated && ' Sign in to start — your first generation is on us.'}
              </EmptySub>
              {!isAuthenticated && (
                <EmptyCta onClick={() => navigate('/login')}>
                  ✦ Start free
                </EmptyCta>
              )}
            </EmptyState>
          )}
        </Viewport>

        {/* ──────── Asset rail ──────── */}
        <Aside>
          <AsideHeader>
            <AsideTitle>My assets</AsideTitle>
            <AssetTabs>
              {(['all', 'pending', 'done', 'cancelled'] as const).map(t => (
                <AssetTabBtn key={t} $active={assetTab === t} onClick={() => setAssetTab(t)}>
                  {t}
                </AssetTabBtn>
              ))}
            </AssetTabs>
            <Search
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </AsideHeader>
          <AssetGrid>
            {!isAuthenticated && (
              <EmptyAssets>
                <span style={{ fontSize: '1.4rem' }}>🔒</span>
                Sign in to see your generations.
              </EmptyAssets>
            )}
            {isAuthenticated && filteredJobs.length === 0 && (
              <EmptyAssets>
                <span style={{ fontSize: '1.4rem' }}>📭</span>
                No assets yet. Generate your first model to see it here.
              </EmptyAssets>
            )}
            {filteredJobs.map(job => {
              const thumbKey = job.imageUrl?.includes('/uploads/')
                ? `uploads/${job.imageUrl.split('/uploads/')[1]}`
                : job.imageUrl;
              const thumb = thumbKey ? `/api/image?key=${encodeURIComponent(thumbKey)}` : null;
              const badgeColor =
                job.status === 'done'                              ? '#10B981' :
                job.status === 'processing' || job.status === 'running' ? '#F59E0B' :
                job.status === 'pending'                           ? '#3B82F6' :
                job.status === 'failed'  || job.status === 'error'? '#EF4444' :
                job.status === 'cancelled'                         ? '#6B7280' :
                '#A855F7';

              // Derive presentation tags
              const isHigh = (job.inferenceSteps ?? 5) > 10;
              const hasTex = !!job.doTexture;

              // Run-time string (mm:ss for done, "running" for in-flight)
              let timeStr = '';
              if (job.status === 'done' && job.startedAt && job.completedAt) {
                const secs = Math.round(
                  (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000,
                );
                timeStr = secs < 60 ? `${secs}s` : `${(secs / 60).toFixed(1)}m`;
              } else if (job.status === 'processing') {
                timeStr = `${job.progressPct ?? 0}%`;
              }

              const commitName = async () => {
                const next = nameDraft.trim();
                if (next && next !== job.name) {
                  await renameJob(job.id, next);
                  setJobs(prev => prev.map(j => j.id === job.id ? { ...j, name: next } : j));
                }
                setEditingNameId(null);
              };

              return (
                <AssetItem key={job.id}>
                  <AssetCard
                    $active={selectedJobId === job.id}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    {thumb
                      ? <AssetThumb
                          src={thumb}
                          alt=""
                          style={
                            !hasTex && job.status === 'done'
                              ? { filter: 'grayscale(0.85) brightness(0.85)' }
                              : undefined
                          }
                        />
                      : <AssetPlaceholder>⬡</AssetPlaceholder>}
                    <AssetBadge $color={badgeColor}>
                      {job.status === 'pending' && queuePos[job.id]
                        ? `#${queuePos[job.id]} queue`
                        : job.status}
                    </AssetBadge>
                    {job.status === 'pending' && (
                      <CancelJobBtn
                        className="cancel-btn"
                        title="Cancel job"
                        onClick={e => onCancelJob(job.id, e)}
                      >✕</CancelJobBtn>
                    )}
                    <AssetOverlay className="asset-overlay">
                      <AssetTag $color={isHigh ? '#C084FC' : undefined}>
                        {isHigh ? 'HIGH' : 'STD'}
                      </AssetTag>
                      <AssetTag $color={hasTex ? '#EC4899' : undefined}>
                        {hasTex ? 'TEXTURED' : 'NO TEX'}
                      </AssetTag>
                      {timeStr && <AssetTime>{timeStr}</AssetTime>}
                    </AssetOverlay>
                    </AssetCard>
                  {editingNameId === job.id ? (
                    <AssetNameInput
                      autoFocus
                      value={nameDraft}
                      placeholder="name…"
                      onChange={e => setNameDraft(e.target.value)}
                      onBlur={commitName}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitName();
                        if (e.key === 'Escape') setEditingNameId(null);
                      }}
                    />
                  ) : (
                    <AssetName
                      $empty={!job.name}
                      title="double-click to rename"
                      onDoubleClick={() => {
                        setEditingNameId(job.id);
                        setNameDraft(job.name || '');
                      }}
                    >
                      {job.name || 'Untitled'}
                    </AssetName>
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

export default Workspace;
