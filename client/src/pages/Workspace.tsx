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
import { confirm } from '../components/ConfirmModal';
import { IconClose, IconTrash } from '../components/Icons';
import { Tooltip } from '../components/Tooltip';
import { DetailOverlay, DetailField } from '../components/DetailOverlay';
import { AdvancedParamsModal, MESH_TYPE_PRESETS, type AdvancedParams } from '../components/AdvancedParamsModal';

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
  prompt?: string;
  style?: string;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  polygonBudget?: string;
  textureRes?: string;
  exportFormat?: string;
  detailLevel?: string;
  doTexture?: boolean;
  useMultiView?: boolean;
  inferenceSteps?: number;
  octreeResolution?: number;
  targetFaceCount?: number;
  guidanceScale?: number;
  numChunks?: number;
  seed?: number;
  auxImageUrls?: string[];
  gpuMemPeakMB?: number;
  gpuUtilAvg?: number;
  gpuUtilPeak?: number;
  gpuSamples?: number;
  progressPct?: number;
  progressPhase?: string;
  model?: string;
  assignedWorkerId?: string;
  preferredWorkerId?: string;
  errorMessage?: string;
  groupId?: string | null;
}

const fetchJobs = async (email: string): Promise<Job[]> => {
  const r = await fetch(`/api/jobs?email=${encodeURIComponent(email)}`);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : (data.jobs || []);
};

type ModelId = 'hunyuan3d' | 'hunyuan3d-2-1' | 'triposr' | 'sf3d' | 'hi3dgen';

interface SubmitOpts {
  quality: 'standard' | 'high';
  doTexture: boolean;
  useMultiView: boolean;
  model: ModelId;
  preferredWorkerId?: string;
  /** Asset group this job belongs to. Empty string = ungrouped. */
  groupId?: string;
  /** Admin-only Hunyuan3D overrides. Any field set to 0/empty falls back
   *  to the quality preset's default. */
  advanced?: {
    octreeResolution?: number;
    inferenceSteps?: number;
    guidanceScale?: number;
    targetFaceCount?: number;
    numChunks?: number;
    seed?: number;
  };
}

export interface AssetGroupSummary {
  id: string;
  userEmail: string;
  name: string;
  styleAnchorUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  jobCount: number;
  doneCount: number;
  thumbUrl: string;
}

const renameJob = async (id: string, name: string): Promise<void> => {
  await fetch(`/api/jobs/${id}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
};

type SubmitResult = { job: Job | null; error: string | null; warnings?: string[] };

const submitJob = async (email: string, file: File, opts: SubmitOpts): Promise<SubmitResult> => {
  const form = new FormData();
  form.append('image', file);
  form.append('email', email);
  // Default the asset name to the uploaded file's stem (no extension), so each
  // generated asset is labelled out of the gate. User can rename later.
  const stem = file.name.replace(/\.[^.]+$/, '');
  form.append('name', stem);
  form.append('exportFormat', 'GLB');
  // Which model runner should process this job. Server defaults to
  // 'hunyuan3d' if the param is missing; we always send it explicitly so
  // the per-model assignment is unambiguous in the jobs table.
  form.append('model', opts.model);
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
  form.append('useMultiView', String(opts.useMultiView));
  if (opts.preferredWorkerId) {
    form.append('preferredWorkerId', opts.preferredWorkerId);
  }
  if (opts.groupId) {
    form.append('groupId', opts.groupId);
  }
  // Admin overrides — when present, they win over the quality preset
  // because /api/upload reads these last (and worker's buildGenParams
  // gives numeric columns priority over label-based detailLevel).
  if (opts.advanced) {
    for (const [k, v] of Object.entries(opts.advanced)) {
      if (typeof v === 'number' && v > 0) form.set(k, String(v));
    }
  }
  const r = await fetch('/api/upload', { method: 'POST', body: form });
  // Read the response body either way so we can surface server-side errors
  // (rate limit, bad image, etc.) instead of silently dropping the click.
  let data: any = null;
  try { data = await r.json(); } catch { /* non-JSON 5xx — fall through */ }
  if (!r.ok) {
    const msg = (data && (data.detail || data.error)) || `Upload failed (HTTP ${r.status})`;
    return { job: null, error: msg };
  }
  return { job: (data?.job ?? data) as Job, error: null, warnings: data?.warnings };
};

const submitTextureRerun = async (
  email: string,
  sourceJobId: string,
  opts: {
    texturePrompt: string;
    textureRes: string;
    model: ModelId;
    preferredWorkerId?: string;
  },
): Promise<SubmitResult> => {
  const r = await fetch(`/api/jobs/${sourceJobId}/texture-rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      texturePrompt: opts.texturePrompt,
      textureRes: opts.textureRes,
      model: opts.model,
      preferredWorkerId: opts.preferredWorkerId,
    }),
  });
  let data: any = null;
  try { data = await r.json(); } catch { /* non-JSON 5xx */ }
  if (!r.ok) {
    const msg = (data && (data.detail || data.error)) || `Texture rerun failed (HTTP ${r.status})`;
    return { job: null, error: msg };
  }
  return { job: (data?.job ?? data) as Job, error: null };
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

// Native <select> styled to match the panel's other form controls.
// Used for the model dropdown (Hunyuan3D / TripoSR / Stable Fast 3D / Hi3DGen).
const ModelSelect = styled.select`
  width: 100%;
  padding: 0.45rem 0.7rem;
  padding-right: 1.85rem;
  border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, ${p => p.theme.colors.textMuted} 50%),
                    linear-gradient(135deg, ${p => p.theme.colors.textMuted} 50%, transparent 50%);
  background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
  &:hover  { border-color: ${p => p.theme.colors.borderHigh}; }
  &:focus  {
    outline: none;
    border-color: ${p => p.theme.colors.violet};
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}33;
  }
`;

const MODEL_OPTIONS: Array<{ value: ModelId; label: string }> = [
  { value: 'hunyuan3d',     label: 'Hunyuan3D-2 (default)' },
  { value: 'hunyuan3d-2-1', label: 'Hunyuan3D-2.1 (PBR materials)' },
  { value: 'triposr',       label: 'TripoSR' },
  { value: 'sf3d',          label: 'Stable Fast 3D' },
  { value: 'hi3dgen',       label: 'Hi3DGen' },
];

const MATERIAL_PRESETS: Array<{ label: string; hint: string }> = [
  { label: 'Auto',    hint: 'infer from prompt' },
  { label: 'Ceramic', hint: 'glaze, clay, porcelain' },
  { label: 'Wood',    hint: 'grain and varnish' },
  { label: 'Metal',   hint: 'polish, wear, rust' },
  { label: 'Stone',   hint: 'mineral, marble, concrete' },
  { label: 'Leather', hint: 'grain, seams, wear' },
  { label: 'Fabric',  hint: 'weave, softness, pattern' },
  { label: 'Plastic', hint: 'matte or glossy polymer' },
];


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

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
`;

const PresetCard = styled.button<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}22, ${p.theme.colors.violet}22)`
    : p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: ${p => p.$active ? p.theme.colors.violet : p.theme.colors.borderHigh}; }
`;

const PresetLabel = styled.span`
  font-size: 0.78rem;
  font-weight: 600;
`;

const PresetHint = styled.span`
  font-size: 0.68rem;
  color: ${p => p.theme.colors.textMuted};
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

const TextureSource = styled.div`
  display: flex;
  gap: 0.65rem;
  align-items: center;
  padding: 0.65rem;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  background: ${p => p.theme.colors.background}88;
`;

const TextureSourceThumb = styled.img`
  width: 58px;
  height: 58px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  flex-shrink: 0;
`;

const TextureSourceMeta = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
`;

const TextureSourceName = styled.div`
  font-size: 0.82rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TextureNote = styled.div`
  font-size: 0.76rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.45;
`;

const TextureReferenceButton = styled.button`
  display: flex;
  width: 100%;
  gap: 0.65rem;
  align-items: center;
  padding: 0.65rem;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  background: ${p => p.theme.colors.background}88;
  color: ${p => p.theme.colors.text};
  font: inherit;
  cursor: pointer;
  text-align: left;
  &:hover { border-color: ${p => p.theme.colors.borderHigh}; }
`;

const TextureOptionsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
`;

const ToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.42rem 0.5rem;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 7px;
  background: ${p => p.theme.colors.background}88;
  color: ${p => p.theme.colors.text};
  font-size: 0.74rem;
  font-weight: 600;
`;

const ControlField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
  font-size: 0.74rem;
  color: ${p => p.theme.colors.text};
`;

const ControlInput = styled.input`
  width: 100%;
  padding: 0.42rem 0.5rem;
  border-radius: 7px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font: inherit;
  font-size: 0.76rem;
  &:focus {
    outline: none;
    border-color: ${p => p.theme.colors.violet};
    box-shadow: 0 0 0 3px ${p => p.theme.colors.violet}33;
  }
`;

const RangeInput = styled.input`
  width: 100%;
  accent-color: ${p => p.theme.colors.violet};
`;

const ControlValue = styled.span`
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.7rem;
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

// Asset-pack picker (sidebar). Filters the asset list to a single pack and
// pins new submissions to it. The "+" button opens the new-pack dialog.
const GroupBar = styled.div`
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-top: 0.25rem;
`;
const GroupSelect = styled.select`
  flex: 1;
  font: inherit;
  font-size: 0.74rem;
  padding: 0.32rem 0.5rem;
  border-radius: 6px;
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  border: 1px solid ${p => p.theme.colors.border};
  cursor: pointer;
  &:hover { border-color: ${p => p.theme.colors.borderHigh}; }
`;
const GroupBtn = styled.button`
  font: inherit;
  font-size: 1rem;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  border: 1px solid ${p => p.theme.colors.border};
  cursor: pointer;
  &:hover { border-color: ${p => p.theme.colors.violet}; color: ${p => p.theme.colors.violet}; }
`;
const ModalBackdrop = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
`;
const ModalCard = styled.div`
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 12px;
  padding: 1.4rem 1.4rem 1.2rem;
  min-width: 340px;
  max-width: 92vw;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
`;
const ModalTitle = styled.h3`
  margin: 0 0 0.85rem;
  font-size: 1.05rem;
  color: ${p => p.theme.colors.text};
`;
const ModalInput = styled.input`
  width: 100%;
  font: inherit;
  padding: 0.55rem 0.75rem;
  border-radius: 7px;
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  border: 1px solid ${p => p.theme.colors.border};
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;
const ModalRow = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
`;
const ModalBtn = styled.button<{ $primary?: boolean }>`
  font: inherit;
  font-size: 0.85rem;
  padding: 0.5rem 0.95rem;
  border-radius: 7px;
  border: 1px solid ${p => p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.theme.colors.text};
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// Small icon button for managing (rename/delete) the selected pack.
const GroupMgmtBtn = styled.button`
  font: inherit;
  font-size: 0.8rem;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.textMuted};
  border: 1px solid ${p => p.theme.colors.border};
  cursor: pointer;
  &:hover:not(:disabled) { border-color: ${p => p.theme.colors.borderHigh}; color: ${p => p.theme.colors.text}; }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
`;

// Inline chip shown below the Generate button when a pack is active.
const PackContextChip = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
  > strong {
    color: ${p => p.theme.colors.violet};
    font-weight: 600;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  > button {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.7rem;
    color: ${p => p.theme.colors.textMuted};
    cursor: pointer;
    &:hover { color: ${p => p.theme.colors.text}; }
  }
`;

// Small pack label badge shown on cards when viewing "All packs".
const GroupTagBadge = styled.div`
  position: absolute;
  left: 5px;
  bottom: 5px;
  font-size: 0.62rem;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 10px);
  pointer-events: none;
`;

// Shared base for the small top-right action chip on asset cards.
// Notes on the polish:
//   - NO transform / scale on hover — that was making the icon visibly
//     shift due to sub-pixel rounding. Hover is communicated via colour
//     and a soft outer glow instead, so the icon stays pixel-locked.
//   - Fixed pixel size, padding:0, line-height:0, & > svg { display:block }
//     — together these guarantee the SVG is centred without any baseline
//     gap or descender offset.
//   - 200ms transitions on bg/border/colour/shadow only — long enough to
//     feel deliberate, short enough to feel responsive.
const CardActionBtn = styled.button`
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
  font-size: 0;            /* kill any inherited line-box */
  opacity: 0;
  transition: opacity 160ms ease, background 200ms ease, color 200ms ease,
              border-color 200ms ease, box-shadow 200ms ease;
  z-index: 3;
  & > svg { display: block; }   /* no descender gap */
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

const CancelJobBtn = styled(CardActionBtn)``;
const DeleteJobBtn = styled(CardActionBtn)``;

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
  &:hover .delete-btn    { opacity: 1; }
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

const TextureToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}> = ({ checked, onChange, children }) => (
  <ToggleRow>
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    {children}
  </ToggleRow>
);

const TextureNumberField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min = 0, max, onChange }) => (
  <ControlField>
    {label}
    <ControlInput
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(parseInt(e.target.value, 10) || min)}
    />
  </ControlField>
);

const TextureSliderField: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, value, onChange }) => (
  <ControlField>
    {label}
    <RangeInput
      type="range"
      min={0}
      max={100}
      value={value}
      onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
    />
    <ControlValue>{value}%</ControlValue>
  </ControlField>
);

const Workspace: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { appUser } = useAppUser();

  // ── State
  const [file, setFile] = useState<File | null>(null);
  const [activeTool, setActiveTool] = useState<'image' | 'texture'>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>('prop');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [doTexture, setDoTexture] = useState(false);
  const [texturePrompt, setTexturePrompt] = useState('');
  const [textureRes, setTextureRes] = useState<'1K' | '2K' | '4K'>('1K');
  const [textureMode, setTextureMode] = useState<'retexture' | 'full'>('retexture');
  const [texturePreset, setTexturePreset] = useState('Auto');
  const [textureReferenceName, setTextureReferenceName] = useState('');
  const [textureStrength, setTextureStrength] = useState(65);
  const [textureVariants, setTextureVariants] = useState(2);
  const [textureSeed, setTextureSeed] = useState(0);
  const [textureKeepShape, setTextureKeepShape] = useState(true);
  const [texturePbrBase, setTexturePbrBase] = useState(true);
  const [texturePbrRoughness, setTexturePbrRoughness] = useState(true);
  const [texturePbrNormal, setTexturePbrNormal] = useState(false);
  const [texturePbrMetallic, setTexturePbrMetallic] = useState(false);
  // Multi-view (Zero123++ auto-generates back/side views on the worker
  // and feeds them to Hunyuan3D-2-mv). Helps on upright subjects;
  // worker auto-skips for horizontal subjects regardless.
  const [useMultiView, setUseMultiView] = useState(false);
  // Admin-only Hunyuan3D overrides. 0 means "use the quality preset value".
  const [advOctree, setAdvOctree] = useState(384);
  const [advSteps, setAdvSteps] = useState(10);
  const [advGuidance, setAdvGuidance] = useState(6);
  const [advFaces, setAdvFaces] = useState(100_000);
  const [advChunks, setAdvChunks] = useState(4000);
  const [advSeed, setAdvSeed] = useState(0);
  const [model, setModel] = useState<ModelId>('hunyuan3d');
  const [preferredWorkerId, setPreferredWorkerId] = useState('');
  const [workers, setWorkers] = useState<{ id: string; models: string[]; busy: number; capacity: number; online: boolean; lastActivity: string | null }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [assetTab, setAssetTab] = useState<'all' | 'pending' | 'done' | 'cancelled'>('all');
  // The job currently being hovered in the right rail. Drives the centre-
  // viewport DetailOverlay — when null, the overlay isn't shown.
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [limits, setLimits] = useState<{ used24h: number; limit24h: number | null } | null>(null);

  // Asset groups: stylistically-related job batches (spaceship fleets, chess
  // sets, etc.). selectedGroupId filters the job list to a single group AND
  // is passed on submit to attach new jobs to that group.
  const [groups, setGroups] = useState<AssetGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [showManagePack, setShowManagePack] = useState(false);
  const [managePackName, setManagePackName] = useState('');
  const [showAdvModal, setShowAdvModal] = useState(false);

  // Gallery images fetched from the text-to-image page — shown in the panel
  // so the user can pick one as the input without re-uploading.
  const [gallery, setGallery] = useState<{ id: string; imageKey: string; name: string; prompt: string }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [loadingFromGallery, setLoadingFromGallery] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textureRefInputRef = useRef<HTMLInputElement>(null);
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
  // Non-admins are pinned to Standard while we're on the GTX 1080. Texture is
  // deliberately open now so we can benchmark the full textured flow.
  const effectiveQuality = isAdmin ? quality : 'standard';
  const effectiveTexture = doTexture;

  // Fetch available workers for the admin picker. Refresh every 30s so
  // the busy/capacity counts stay reasonably fresh.
  useEffect(() => {
    if (!isAdmin || !email) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/workers?email=${encodeURIComponent(email)}`);
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (!cancelled) setWorkers(data.workers || []);
      } catch { /* non-fatal */ }
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isAdmin, email]);

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

  // Fetch the user's asset groups (sidebar). Refresh every 15s so newly-
  // attached jobs bump the group counts without needing a hard reload.
  useEffect(() => {
    if (!isAuthenticated || !email) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/groups?email=${encodeURIComponent(email)}`);
        if (!r.ok || cancelled) return;
        const d = await r.json();
        if (!cancelled) setGroups(d.groups || []);
      } catch { /* non-fatal */ }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isAuthenticated, email]);

  const onCreateGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!name || !email) return;
    try {
      const r = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      if (!r.ok) return;
      const d = await r.json();
      const created: AssetGroupSummary = {
        ...d.group, jobCount: 0, doneCount: 0, thumbUrl: d.group.styleAnchorUrl || '',
      };
      setGroups(prev => [created, ...prev]);
      setSelectedGroupId(created.id);
      setShowNewGroup(false);
      setNewGroupName('');
    } catch { /* non-fatal */ }
  }, [newGroupName, email]);

  const onOpenManagePack = useCallback(() => {
    const g = groups.find(g => g.id === selectedGroupId);
    if (!g) return;
    setManagePackName(g.name);
    setShowManagePack(true);
  }, [groups, selectedGroupId]);

  const onRenamePack = useCallback(async () => {
    const name = managePackName.trim();
    if (!name || !selectedGroupId || !email) return;
    try {
      const r = await fetch(`/api/groups/${selectedGroupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      if (!r.ok) return;
      setGroups(prev => prev.map(g => g.id === selectedGroupId ? { ...g, name } : g));
      setShowManagePack(false);
    } catch { /* non-fatal */ }
  }, [managePackName, selectedGroupId, email]);

  const onDeletePack = useCallback(async () => {
    if (!selectedGroupId || !email) return;
    const g = groups.find(g => g.id === selectedGroupId);
    const ok = await confirm({
      title: `Delete "${g?.name || 'this pack'}"?`,
      message: 'The pack will be removed. Assets inside keep their files — only the pack label disappears.',
      confirmLabel: 'Delete pack',
      cancelLabel: 'Keep',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await fetch(`/api/groups/${selectedGroupId}?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      setGroups(prev => prev.filter(g => g.id !== selectedGroupId));
      setSelectedGroupId('');
      setShowManagePack(false);
    } catch { /* non-fatal */ }
  }, [selectedGroupId, email, groups]);

  // Fetch the user's text-to-image gallery on mount so the panel picker is ready.
  useEffect(() => {
    if (!isAuthenticated || !email) return;
    setGalleryLoading(true);
    fetch(`/api/text2image/assets?email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => setGallery((d.assets || [])
        // Only images the user has marked as ready for 3D conversion. The
        // user toggles this in TextToImage's details panel; default is true,
        // so existing images keep flowing through.
        .filter((a: any) => a.readyFor3D !== false)
        .map((a: any) => ({
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
    setSubmitError(null);
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
    setSubmitError(null);
    const { job, error } = await submitJob(email, file, {
      quality: effectiveQuality,
      doTexture: effectiveTexture,
      useMultiView: isAdmin ? useMultiView : false,
      model,
      preferredWorkerId: isAdmin ? preferredWorkerId : undefined,
      groupId: selectedGroupId || undefined,
      // Advanced params are always sent — quality tier buttons set them for
      // all users; admin fine-tune inputs can override further.
      advanced: {
        octreeResolution: advOctree,
        inferenceSteps:   advSteps,
        guidanceScale:    advGuidance,
        targetFaceCount:  advFaces,
        numChunks:        advChunks,
        seed:             advSeed,
      },
    });
    setSubmitting(false);
    if (job) {
      setJobs(prev => [job, ...prev]);
      setSelectedJobId(job.id);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null);
      setPreviewUrl(null);
    } else if (error) {
      setSubmitError(error);
      // Server's view of limits may have moved (e.g. just hit the cap on this
      // call). Refresh so the button label reflects reality.
      fetch(`/api/limits?email=${encodeURIComponent(email)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setLimits({ used24h: d.used24h, limit24h: d.limit24h }); })
        .catch(() => { /* non-fatal */ });
    }
  }, [isAuthenticated, navigate, file, email, submitting, previewUrl, effectiveQuality, effectiveTexture, model, isAdmin, preferredWorkerId]);


  const onCancelJob = useCallback(async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const label = name?.trim() || 'this job';
    const ok = await confirm({
      title: `Cancel ${label}?`,
      message: 'The job will stop. If it has already started, the worker will shut down at the next safe checkpoint.',
      confirmLabel: 'Cancel job',
      cancelLabel: 'Keep running',
      variant: 'danger',
    });
    if (!ok) return;
    await fetch(`/api/jobs/${id}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'cancelled' } : j));
  }, [email]);

  // Soft-deletes the job server-side (sets deleted=true; row + R2 file
  // remain so an admin can recover) and removes it from the rail.
  const onDeleteJob = useCallback(async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const label = name?.trim() || 'this asset';
    const ok = await confirm({
      title: `Delete ${label}?`,
      message: 'It will disappear from your asset rail. This removes it from your view only — the file stays archived server-side.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      variant: 'danger',
    });
    if (!ok) return;
    const r = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      console.warn('Delete failed', await r.text());
      return;
    }
    setJobs(prev => prev.filter(j => j.id !== id));
    setSelectedJobId(prev => (prev === id ? null : prev));
  }, []);

  const onSignOut = async () => {
    await signOutUser();
    window.location.href = '/';
  };

  // ── Derived
  // Hovered job → fields for the centre-viewport detail overlay.
  const hoveredJob = useMemo(
    () => (hoveredJobId ? jobs.find(j => j.id === hoveredJobId) ?? null : null),
    [jobs, hoveredJobId],
  );
  const hoveredJobOverlay = useMemo(() => {
    if (!hoveredJob) return null;
    const j = hoveredJob;
    const badgeColor =
      j.status === 'done'                                          ? '#10B981' :
      j.status === 'processing' || j.status === 'running'         ? '#F59E0B' :
      j.status === 'pending'                                       ? '#3B82F6' :
      j.status === 'failed'  || j.status === 'error'              ? '#EF4444' :
      j.status === 'cancelled'                                     ? '#6B7280' :
      '#A855F7';
    let runtime = '—';
    if (j.status === 'done' && j.startedAt && j.completedAt) {
      const secs = Math.round(
        (new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 1000,
      );
      runtime = secs < 60 ? `${secs}s` : `${(secs / 60).toFixed(1)}m`;
    } else if (j.status === 'processing' || j.status === 'running') {
      runtime = `${j.progressPct ?? 0}% — ${j.progressPhase || 'in progress'}`;
    }
    const auxN = Array.isArray(j.auxImageUrls) ? j.auxImageUrls.length : 0;
    const fields: DetailField[] = [
      { label: 'Prompt',          value: j.prompt?.trim() || '(image-driven, no prompt)', wide: true },
      { label: 'Model',           value: j.model || 'hunyuan3d' },
      { label: 'Quality',         value: j.detailLevel || ((j.inferenceSteps ?? 5) > 10 ? 'Fine' : 'Standard') },
      { label: 'Texture',         value: j.doTexture ? 'On' : 'Off' },
      { label: 'Multi-view',      value: j.useMultiView ? 'On (forced)' : (auxN > 0 ? `${auxN} aux views (heuristic)` : 'Off') },
      { label: 'Inference steps', value: j.inferenceSteps || '—' },
      { label: 'Octree res',      value: j.octreeResolution || '—' },
      { label: 'Guidance scale',  value: j.guidanceScale || '—' },
      { label: 'Target faces',    value: j.targetFaceCount ? j.targetFaceCount.toLocaleString() : '—' },
      { label: 'Num chunks',      value: j.numChunks || '—' },
      { label: 'Seed',            value: j.seed && j.seed > 0 ? j.seed : 'random' },
      { label: 'Polygon budget',  value: j.polygonBudget || '—' },
      { label: 'Texture res',     value: j.textureRes || '—' },
      { label: 'Export format',   value: j.exportFormat || 'GLB' },
      { label: 'Style',           value: j.style || '—' },
      { label: 'Worker',          value: j.assignedWorkerId || `(pref: ${j.preferredWorkerId || 'auto'})` },
      ...(j.gpuSamples && j.gpuSamples > 0
        ? [
            { label: 'GPU peak VRAM', value: `${(j.gpuMemPeakMB ?? 0).toLocaleString()} MB` } as DetailField,
            { label: 'GPU util',      value: `avg ${(j.gpuUtilAvg ?? 0).toFixed(0)}% · peak ${(j.gpuUtilPeak ?? 0).toFixed(0)}%` } as DetailField,
          ]
        : []),
      { label: 'Runtime',         value: runtime },
      { label: 'Created',         value: j.createdAt ? new Date(j.createdAt).toLocaleString() : '—' },
      ...(j.errorMessage
        ? [{ label: 'Error', value: j.errorMessage.slice(0, 200), wide: true } as DetailField]
        : []),
      { label: 'Job id',          value: j.id, mono: true, wide: true },
    ];
    return { job: j, fields, badgeColor };
  }, [hoveredJob]);

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
    if (selectedGroupId) list = list.filter(j => j.groupId === selectedGroupId);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(j => (j.name || j.id).toLowerCase().includes(q));
    // Processing/running jobs surface first, then everything sorted by
    // createdAt DESC inside each group (recent at top).
    return [...list].sort((a, b) => {
      const isActive = (s: string) => s === 'processing' || s === 'running' ? 0 : 1;
      const ag = isActive(a.status);
      const bg = isActive(b.status);
      if (ag !== bg) return ag - bg;
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
  }, [jobs, search, assetTab, selectedGroupId]);

  const meshUrl = selectedJob?.resultUrl
    ? `/api/mesh?key=${encodeURIComponent(selectedJob.resultUrl)}`
    : null;

  const selectedThumbKey = selectedJob?.imageUrl?.includes('/uploads/')
    ? `uploads/${selectedJob.imageUrl.split('/uploads/')[1]}`
    : selectedJob?.imageUrl;
  const selectedThumb = selectedThumbKey
    ? `/api/image?key=${encodeURIComponent(selectedThumbKey)}`
    : null;

  const onTextureRerun = useCallback(async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!selectedJob || !email || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const { job, error } = await submitTextureRerun(email, selectedJob.id, {
      texturePrompt,
      textureRes,
      model,
      preferredWorkerId: isAdmin ? preferredWorkerId : undefined,
    });
    setSubmitting(false);
    if (job) {
      setJobs(prev => [job, ...prev]);
      setSelectedJobId(job.id);
      setAssetTab('all');
    } else if (error) {
      setSubmitError(error);
      fetch(`/api/limits?email=${encodeURIComponent(email)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setLimits({ used24h: d.used24h, limit24h: d.limit24h }); })
        .catch(() => { /* non-fatal */ });
    }
  }, [isAuthenticated, navigate, selectedJob, email, submitting, texturePrompt, textureRes, model, isAdmin, preferredWorkerId]);

  const primaryActionLabel = activeTool === 'texture'
    ? (!isAuthenticated
        ? 'Sign in to texture'
        : submitting
          ? 'Submitting...'
          : textureMode === 'retexture'
            ? 'Texture worker needed'
          : !selectedJob
            ? 'Select an asset first'
            : selectedJob.status !== 'done'
              ? 'Wait for this asset to finish'
              : (!isAdmin && limits && limits.limit24h !== null && limits.used24h >= limits.limit24h)
                ? 'Daily limit reached - try again later'
                : 'Generate textured run')
    : (!isAuthenticated
        ? 'Sign in to generate'
        : submitting
          ? 'Submitting...'
          : !file
            ? 'Upload an image first'
            : (!isAdmin && limits && limits.limit24h !== null && limits.used24h >= limits.limit24h)
              ? 'Daily limit reached - try again later'
              : 'Generate (free)');

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
          <RailItem icon="🖼" label="Image" active={activeTool === 'image'} title="Image to 3D" onClick={() => setActiveTool('image')} />
          <RailItem icon="✨" label="Text" title="Text to image"
                    onClick={() => navigate('/dashboard/text')} />
          <RailItem icon="🎨" label="Texture" active={activeTool === 'texture'} title="Texture selected asset" onClick={() => setActiveTool('texture')} />
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
            <PanelTitle>{activeTool === 'texture' ? 'Texture' : 'Image to 3D'}</PanelTitle>
            <FieldHint
              style={{ cursor: 'pointer', fontSize: '0.72rem' }}
              onClick={() => activeTool === 'texture' ? setActiveTool('image') : navigate('/dashboard/text')}
              title={activeTool === 'texture' ? 'Back to Image to 3D' : 'Go to Text to Image'}
            >
              {activeTool === 'texture' ? 'Inputs' : '✨ Create images'}
            </FieldHint>
          </PanelHeader>

          {/* Filmstrip — user's text-to-image gallery as horizontal thumbnails */}
          {activeTool === 'image' && <FilmstripWrap>
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
                  <img
                    src={`/api/image?key=${encodeURIComponent(img.imageKey)}`}
                    alt={img.name}
                    loading="lazy"
                    decoding="async"
                  />
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
          </FilmstripWrap>}

          <PanelBody>
            {activeTool === 'texture' ? (
              <>
                <Field>
                  <FieldLabel>
                    Source asset
                    <FieldHint>{selectedJob?.status === 'done' ? 'ready' : 'select a finished asset'}</FieldHint>
                  </FieldLabel>
                  {selectedJob && selectedThumb ? (
                    <TextureSource>
                      <TextureSourceThumb src={selectedThumb} alt="" />
                      <TextureSourceMeta>
                        <TextureSourceName>{selectedJob.name || 'Untitled asset'}</TextureSourceName>
                        <TextureNote>
                          Selected model. Texture inputs stay here; generated results appear on the right.
                        </TextureNote>
                      </TextureSourceMeta>
                    </TextureSource>
                  ) : (
                    <TextureNote>Select a generated asset on the right. It will stay in the center while you set texture inputs here.</TextureNote>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Mode <FieldHint>{textureMode === 'retexture' ? 'same mesh' : 'new mesh'}</FieldHint></FieldLabel>
                  <Segmented>
                    <SegmentedBtn $active={textureMode === 'retexture'} onClick={() => setTextureMode('retexture')}>
                      Retexture
                    </SegmentedBtn>
                    <SegmentedBtn $active={textureMode === 'full'} onClick={() => setTextureMode('full')}>
                      Full run
                    </SegmentedBtn>
                  </Segmented>
                </Field>

                <Field>
                  <FieldLabel>Prompt <FieldHint>surface direction</FieldHint></FieldLabel>
                  <PromptArea
                    placeholder="e.g. aged bronze, worn edges, subtle roughness"
                    value={texturePrompt}
                    onChange={e => setTexturePrompt(e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel>Material preset <FieldHint>quick starting point</FieldHint></FieldLabel>
                  <PresetGrid>
                    {MATERIAL_PRESETS.map(preset => (
                      <PresetCard
                        key={preset.label}
                        $active={texturePreset === preset.label}
                        onClick={() => setTexturePreset(preset.label)}
                      >
                        <PresetLabel>{preset.label}</PresetLabel>
                        <PresetHint>{preset.hint}</PresetHint>
                      </PresetCard>
                    ))}
                  </PresetGrid>
                </Field>

                <Field>
                  <FieldLabel>Reference <FieldHint>{textureReferenceName || 'optional material image'}</FieldHint></FieldLabel>
                  <TextureReferenceButton type="button" onClick={() => textureRefInputRef.current?.click()}>
                    <HiddenInput
                      ref={textureRefInputRef}
                      type="file"
                      accept="image/*"
                      onChange={e => setTextureReferenceName(e.target.files?.[0]?.name || '')}
                    />
                    <TextureSourceMeta>
                      <TextureSourceName>{textureReferenceName || 'Add reference image'}</TextureSourceName>
                      <TextureNote>Use a photo of marble, fabric, leather, paint, metal grain, or any target look.</TextureNote>
                    </TextureSourceMeta>
                  </TextureReferenceButton>
                </Field>

                <Field>
                  <FieldLabel>Resolution <FieldHint>texture output size</FieldHint></FieldLabel>
                  <Segmented>
                    {(['1K', '2K', '4K'] as const).map(r => (
                      <SegmentedBtn key={r} $active={textureRes === r} onClick={() => setTextureRes(r)}>
                        {r}
                      </SegmentedBtn>
                    ))}
                  </Segmented>
                </Field>

                <Field>
                  <FieldLabel>PBR maps <FieldHint>export controls</FieldHint></FieldLabel>
                  <TextureOptionsGrid>
                    <TextureToggle checked={texturePbrBase} onChange={setTexturePbrBase}>Base color</TextureToggle>
                    <TextureToggle checked={texturePbrRoughness} onChange={setTexturePbrRoughness}>Roughness</TextureToggle>
                    <TextureToggle checked={texturePbrNormal} onChange={setTexturePbrNormal}>Normal</TextureToggle>
                    <TextureToggle checked={texturePbrMetallic} onChange={setTexturePbrMetallic}>Metallic</TextureToggle>
                  </TextureOptionsGrid>
                </Field>

                <Field>
                  <FieldLabel>Controls <FieldHint>iteration settings</FieldHint></FieldLabel>
                  <TextureOptionsGrid>
                    <TextureSliderField label="Strength" value={textureStrength} onChange={setTextureStrength} />
                    <TextureNumberField
                      label="Variants"
                      value={textureVariants}
                      min={1}
                      max={4}
                      onChange={v => setTextureVariants(Math.max(1, Math.min(4, v)))}
                    />
                    <TextureNumberField label="Seed" value={textureSeed} onChange={setTextureSeed} />
                    <TextureToggle checked={textureKeepShape} onChange={setTextureKeepShape}>Keep shape</TextureToggle>
                  </TextureOptionsGrid>
                </Field>
              </>
            ) : (
            <>
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
                Model <FieldHint>which runner generates the mesh</FieldHint>
              </FieldLabel>
              <ModelSelect value={model} onChange={e => { setModel(e.target.value as ModelId); setActivePreset(null); }}>
                {MODEL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </ModelSelect>
            </Field>

            {isAdmin && workers.length > 0 && (
              <Field>
                <FieldLabel>
                  Worker <FieldHint>admin — pin to a specific server</FieldHint>
                </FieldLabel>
                <ModelSelect value={preferredWorkerId} onChange={e => setPreferredWorkerId(e.target.value)}>
                  <option value="">Any available</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.online ? '🟢' : '🔴'} {w.id} — {w.busy > 0 ? `working` : w.online ? 'idle' : 'offline'}
                    </option>
                  ))}
                </ModelSelect>
              </Field>
            )}


            <Field>
              <FieldLabel>Texture <FieldHint>full textured generation</FieldHint></FieldLabel>
              <Segmented>
                <SegmentedBtn $active={!doTexture} onClick={() => { setDoTexture(false); setActivePreset(null); }}>Off</SegmentedBtn>
                <SegmentedBtn $active={doTexture} onClick={() => { setDoTexture(true); setActivePreset(null); }}>On</SegmentedBtn>
              </Segmented>
            </Field>
            {isAdmin && (
              <Field>
                <FieldLabel>Multi-view <FieldHint>auto-generates back+side views; skipped if subject is horizontal</FieldHint></FieldLabel>
                <Segmented>
                  <SegmentedBtn $active={!useMultiView} onClick={() => setUseMultiView(false)}>Off</SegmentedBtn>
                  <SegmentedBtn $active={useMultiView} onClick={() => setUseMultiView(true)}>On</SegmentedBtn>
                </Segmented>
              </Field>
            )}

            <Field>
              <FieldLabel>
                Mesh type
                <FieldHint>{MESH_TYPE_PRESETS.find(t => t.id === activePreset)?.hint ?? 'custom'}</FieldHint>
              </FieldLabel>
              <PresetGrid>
                {MESH_TYPE_PRESETS.map(t => (
                  <PresetCard
                    key={t.id}
                    type="button"
                    $active={activePreset === t.id}
                    title={t.desc}
                    onClick={() => {
                      setActivePreset(t.id);
                      setAdvOctree(t.octree);
                      setAdvSteps(t.steps);
                      setAdvGuidance(t.guidance);
                      setAdvFaces(t.faces);
                      setAdvChunks(t.chunks);
                    }}
                  >
                    <PresetLabel>{t.label}</PresetLabel>
                    <PresetHint>{t.hint}</PresetHint>
                  </PresetCard>
                ))}
              </PresetGrid>
            </Field>

            {isAdmin && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAdvModal(true)}
                  style={{
                    background: 'none', border: 'none', padding: '0.2rem 0',
                    fontSize: '0.72rem', color: activePreset ? 'var(--text-muted, #888)' : '#c084fc',
                    cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  {activePreset ? '⚙ Fine-tune params' : '⚙ Custom params (active)'}
                </button>
              </div>
            )}

            <Field>
              <FieldLabel>Format</FieldLabel>
              <Segmented>
                <SegmentedBtn $active>GLB</SegmentedBtn>
                <SegmentedBtn $disabled>OBJ <ComingSoonTag>soon</ComingSoonTag></SegmentedBtn>
                <SegmentedBtn $disabled>FBX <ComingSoonTag>soon</ComingSoonTag></SegmentedBtn>
              </Segmented>
            </Field>
            </>
            )}
          </PanelBody>
          <PanelFooter>
            <CostRow>
              <span>Expected wait</span>
              <CostValue>
                ⏱{' '}
                {activeTool === 'texture'
                  ? '~15 min'
                  : effectiveQuality === 'high'
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
                activeTool === 'texture'
                  ? (!isAuthenticated ? false : (textureMode === 'retexture' || !selectedJob || selectedJob.status !== 'done' || submitting ||
                     (!isAdmin && !!limits && limits.limit24h !== null && limits.used24h >= limits.limit24h)))
                  : !isAuthenticated
                    ? false
                    : (!file || submitting ||
                       (!isAdmin && !!limits && limits.limit24h !== null && limits.used24h >= limits.limit24h))
              }
              onClick={activeTool === 'texture' ? onTextureRerun : onGenerate}
            >
              {primaryActionLabel}
            </GenerateBtn>
            {activeTool !== 'texture' && selectedGroupId && (() => {
              const g = groups.find(g => g.id === selectedGroupId);
              return g ? (
                <PackContextChip>
                  Adding to:&nbsp;<strong title={g.name}>{g.name}</strong>
                  <button type="button" onClick={() => setSelectedGroupId('')} title="Remove pack context">✕</button>
                </PackContextChip>
              ) : null;
            })()}
            {submitError && (
              <div
                role="alert"
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(220, 60, 60, 0.12)',
                  border: '1px solid rgba(220, 60, 60, 0.35)',
                  color: '#ffb4b4',
                  fontSize: '0.78rem',
                  lineHeight: 1.4,
                }}
              >
                {submitError}
              </div>
            )}
          </PanelFooter>
        </Panel>

        {/* ──────── Central viewport ──────── */}
        <Viewport>
          <GridBg />
          {hoveredJobOverlay && (
            <DetailOverlay
              visible
              title={hoveredJobOverlay.job.name?.trim() || 'Untitled asset'}
              subtitle="3D asset"
              status={{
                label:
                  hoveredJobOverlay.job.status === 'pending' ? 'queued' : hoveredJobOverlay.job.status,
                color: hoveredJobOverlay.badgeColor,
              }}
              fields={hoveredJobOverlay.fields}
              thumbUrl={(() => {
                const k = hoveredJobOverlay.job.imageUrl?.includes('/uploads/')
                  ? `uploads/${hoveredJobOverlay.job.imageUrl.split('/uploads/')[1]}`
                  : hoveredJobOverlay.job.imageUrl;
                return k ? `/api/image?key=${encodeURIComponent(k)}` : undefined;
              })()}
              auxThumbUrls={isAdmin
                ? ((hoveredJobOverlay.job as any).auxImageUrls || [])
                    .map((url: string) => {
                      // Route through /api/image so the R2-private URLs render.
                      for (const prefix of ['/uploads/', '/mv-auto/', '/mvtest/', '/outputs/']) {
                        const idx = url.indexOf(prefix);
                        if (idx >= 0) {
                          const key = prefix.slice(1) + url.slice(idx + prefix.length);
                          return `/api/image?key=${encodeURIComponent(key)}`;
                        }
                      }
                      return null;
                    })
                    .filter(Boolean) as string[]
                : undefined}
            />
          )}
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
            <AsideTitle>{activeTool === 'texture' ? 'Generated outputs' : 'My assets'}</AsideTitle>
            <AssetTabs>
              {(['all', 'pending', 'done', 'cancelled'] as const).map(t => (
                <AssetTabBtn key={t} $active={assetTab === t} onClick={() => setAssetTab(t)}>
                  {t}
                </AssetTabBtn>
              ))}
            </AssetTabs>
            <Search
              placeholder={activeTool === 'texture' ? 'Search outputs…' : 'Search…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {isAuthenticated && (
              <GroupBar>
                <GroupSelect
                  value={selectedGroupId}
                  onChange={e => setSelectedGroupId(e.target.value)}
                  title="Filter by asset pack — and pin new submissions to the selected pack"
                >
                  <option value="">All packs</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.jobCount})
                    </option>
                  ))}
                </GroupSelect>
                <GroupMgmtBtn
                  type="button"
                  disabled={!selectedGroupId}
                  onClick={onOpenManagePack}
                  title="Rename or delete this pack"
                >
                  ···
                </GroupMgmtBtn>
                <GroupBtn type="button" onClick={() => setShowNewGroup(true)} title="New asset pack">
                  +
                </GroupBtn>
              </GroupBar>
            )}
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
                {selectedGroupId
                  ? <>No assets in this pack yet. Submit a job with this pack selected to add some.</>
                  : <>No assets yet. Generate your first model to see it here.</>
                }
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
                <AssetItem
                  key={job.id}
                  onMouseEnter={() => setHoveredJobId(job.id)}
                  onMouseLeave={() => setHoveredJobId(prev => (prev === job.id ? null : prev))}
                >
                  <AssetCard
                    $active={selectedJobId === job.id}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    {thumb
                      ? <AssetThumb
                          src={thumb}
                          alt=""
                          loading="lazy"
                          decoding="async"
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
                    {job.status === 'pending' || job.status === 'processing' || job.status === 'running' ? (
                      <Tooltip text="Cancel job" placement="left">
                        <CancelJobBtn
                          className="cancel-btn"
                          aria-label="Cancel job"
                          onClick={e => onCancelJob(job.id, job.name || '', e)}
                        >
                          <IconClose size={13} />
                        </CancelJobBtn>
                      </Tooltip>
                    ) : (
                      <DeleteJobBtn
                        className="delete-btn"
                        aria-label="Delete asset"
                        onClick={e => onDeleteJob(job.id, job.name || '', e)}
                      >
                        <IconTrash size={13} />
                      </DeleteJobBtn>
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
                    {!selectedGroupId && job.groupId && (() => {
                      const g = groups.find(g => g.id === job.groupId);
                      return g ? <GroupTagBadge title={g.name}>{g.name}</GroupTagBadge> : null;
                    })()}

                    {/* Live status line: worker + model + phase (always visible while in-flight) */}
                    {(job.status === 'processing' || job.status === 'running' || job.status === 'pending') && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 6, right: 6, bottom: 6,
                          background: 'rgba(10,12,18,0.85)',
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: '0.62rem',
                          color: '#E4E4E7',
                          lineHeight: 1.25,
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: job.assignedWorkerId ? '#10B981' : '#F59E0B',
                          }} />
                          <strong style={{ fontSize: '0.62rem' }}>
                            {job.assignedWorkerId || (job.preferredWorkerId ? `→ ${job.preferredWorkerId}` : 'queued')}
                          </strong>
                          {job.model && <span style={{ color: '#A4A4AC' }}>· {job.model}</span>}
                        </div>
                        {(job.status === 'processing' || job.status === 'running') && (
                          <>
                            <div style={{
                              color: '#A4A4AC', marginTop: 2,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {job.progressPhase || 'in progress…'}
                            </div>
                            <div style={{
                              height: 3, background: '#22232A', borderRadius: 2,
                              marginTop: 3, overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${Math.min(100, job.progressPct ?? 0)}%`,
                                height: '100%',
                                background: '#A855F7',
                                transition: 'width 0.4s',
                              }} />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Failure reason — visible without clicking */}
                    {(job.status === 'failed' || job.status === 'error') && job.errorMessage && (
                      <div
                        title={job.errorMessage}
                        style={{
                          position: 'absolute',
                          left: 6, right: 6, bottom: 6,
                          background: 'rgba(127,29,29,0.92)',
                          color: '#FECACA',
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: '0.62rem',
                          lineHeight: 1.25,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          pointerEvents: 'none',
                        }}
                      >
                        ⚠ {job.errorMessage}
                      </div>
                    )}
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

      {showNewGroup && (
        <ModalBackdrop onClick={() => setShowNewGroup(false)}>
          <ModalCard onClick={e => e.stopPropagation()}>
            <ModalTitle>New asset pack</ModalTitle>
            <ModalInput
              autoFocus
              placeholder="e.g. Spaceship fleet, Chess set"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onCreateGroup();
                if (e.key === 'Escape') setShowNewGroup(false);
              }}
              maxLength={80}
            />
            <ModalRow>
              <ModalBtn type="button" onClick={() => setShowNewGroup(false)}>Cancel</ModalBtn>
              <ModalBtn type="button" $primary disabled={!newGroupName.trim()} onClick={onCreateGroup}>
                Create
              </ModalBtn>
            </ModalRow>
          </ModalCard>
        </ModalBackdrop>
      )}
      {showManagePack && (
        <ModalBackdrop onClick={() => setShowManagePack(false)}>
          <ModalCard onClick={e => e.stopPropagation()}>
            <ModalTitle>Manage pack</ModalTitle>
            <ModalInput
              autoFocus
              placeholder="Pack name"
              value={managePackName}
              onChange={e => setManagePackName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onRenamePack();
                if (e.key === 'Escape') setShowManagePack(false);
              }}
              maxLength={80}
            />
            <ModalRow>
              <ModalBtn
                type="button"
                onClick={onDeletePack}
                style={{ marginRight: 'auto', color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}
              >
                Delete pack
              </ModalBtn>
              <ModalBtn type="button" onClick={() => setShowManagePack(false)}>Cancel</ModalBtn>
              <ModalBtn type="button" $primary disabled={!managePackName.trim()} onClick={onRenamePack}>
                Rename
              </ModalBtn>
            </ModalRow>
          </ModalCard>
        </ModalBackdrop>
      )}
      <AdvancedParamsModal
        open={showAdvModal && isAdmin}
        onClose={() => setShowAdvModal(false)}
        activePreset={activePreset}
        values={{ octree: advOctree, steps: advSteps, guidance: advGuidance, faces: advFaces, chunks: advChunks, seed: advSeed }}
        onChange={(v: AdvancedParams, presetId: string | null) => {
          setAdvOctree(v.octree); setAdvSteps(v.steps); setAdvGuidance(v.guidance);
          setAdvFaces(v.faces); setAdvChunks(v.chunks); setAdvSeed(v.seed);
          setActivePreset(presetId);
        }}
      />
    </Shell>
  );
};

export default Workspace;
