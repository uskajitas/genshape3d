import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { signOutUser } from '../firebase';
import { useAppUser } from '../context/UserContext';

// ── Animations ────────────────────────────────────────────────────────────────

const pulse = keyframes`
  0%, 100% { opacity: 0.5; } 50% { opacity: 1; }
`;

const spin = keyframes`
  from { transform: rotate(0deg); } to { transform: rotate(360deg); }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

const progressFill = keyframes`
  from { width: 0; } to { width: var(--fill); }
`;

// ── Shell ─────────────────────────────────────────────────────────────────────

const Shell = styled.div`
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: ${p => p.theme.colors.background};
`;

// ── Sidebar ───────────────────────────────────────────────────────────────────

const Sidebar = styled.aside`
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.surface};
  border-right: 1px solid ${p => p.theme.colors.border};
  overflow: hidden;
`;

const SidebarTop = styled.div`
  padding: 1.25rem 1rem 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

const Brand = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: 'Orbitron', monospace;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: ${p => p.theme.colors.text};
`;

const BrandIcon = styled.div`
  width: 28px; height: 28px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem;
`;

const SideNav = styled.nav`
  flex: 1;
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow-y: auto;
`;

const SideGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const SideGroupLabel = styled.div`
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
  padding: 0 0.5rem;
  margin-bottom: 0.4rem;
`;

const NavItem = styled.button<{ $active?: boolean; $accent?: string }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  border: none;
  background: ${p => p.$active
    ? (p.$accent ? `${p.$accent}20` : `${p.theme.colors.primary}20`)
    : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  font-size: 0.84rem;
  font-weight: ${p => p.$active ? 600 : 400};
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  border-left: 2px solid ${p => p.$active
    ? (p.$accent || p.theme.colors.primary)
    : 'transparent'};
  &:hover {
    background: ${p => p.theme.colors.surfaceHigh};
    color: ${p => p.theme.colors.text};
  }
`;

const NavIcon = styled.span`
  font-size: 1rem;
  opacity: 0.8;
`;

const SidebarBottom = styled.div`
  padding: 0.75rem;
  border-top: 1px solid ${p => p.theme.colors.border};
`;

const UserChip = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  border-radius: 9px;
  background: ${p => p.theme.colors.surfaceHigh};
  border: 1px solid ${p => p.theme.colors.border};
`;

const Avatar = styled.div<{ $src?: string }>`
  width: 30px; height: 30px;
  border-radius: 50%;
  background: ${p => p.$src
    ? `url(${p.$src}) center/cover`
    : `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`};
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem;
  color: #fff;
  flex-shrink: 0;
`;

const UserInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.div`
  font-size: 0.78rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserRole = styled.div<{ $role: string }>`
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${p =>
    p.$role === 'pro' ? p.theme.colors.violet :
    p.$role === 'free' ? p.theme.colors.green :
    p.theme.colors.grey};
`;

// ── Main ──────────────────────────────────────────────────────────────────────

const Main = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

// ── Topbar ────────────────────────────────────────────────────────────────────

const Topbar = styled.header`
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.75rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
`;

const TopbarLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const PageTitle = styled.h1`
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
`;

const Breadcrumb = styled.span`
  font-size: 0.8rem;
  color: ${p => p.theme.colors.textMuted};
`;

const TopbarRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const CreditPill = styled.div<{ $warn?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  background: ${p => p.$warn
    ? `${p.theme.colors.primary}18`
    : `${p.theme.colors.green}18`};
  border: 1px solid ${p => p.$warn
    ? `${p.theme.colors.primary}44`
    : `${p.theme.colors.green}44`};
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  color: ${p => p.$warn ? p.theme.colors.primaryLight : p.theme.colors.green};
`;

const UpgradeBtn = styled(Link)`
  font-size: 0.8rem;
  font-weight: 700;
  color: #fff;
  padding: 0.4rem 1rem;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border-radius: 8px;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
`;

const IconBtn = styled.button`
  width: 34px; height: 34px;
  border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.15s;
  &:hover {
    background: ${p => p.theme.colors.surfaceHigh};
    color: ${p => p.theme.colors.text};
    border-color: ${p => p.theme.colors.borderHigh};
  }
`;

// ── Body ──────────────────────────────────────────────────────────────────────

const Body = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

// ── Generator Panel ───────────────────────────────────────────────────────────

const GenPanel = styled.div`
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  overflow-y: auto;
`;

const PanelSection = styled.div`
  padding: 1.25rem 1.25rem 0;
`;

const PanelTitle = styled.div`
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.75rem;
`;

const PromptBox = styled.textarea`
  width: 100%;
  min-height: 100px;
  background: ${p => p.theme.colors.background};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  padding: 0.85rem;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text};
  font-family: 'Inter', sans-serif;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  &::placeholder { color: ${p => p.theme.colors.textMuted}; }
  &:focus {
    border-color: ${p => p.theme.colors.primary};
    box-shadow: 0 0 0 3px ${p => p.theme.colors.primary}18;
  }
`;

const UploadZone = styled.div<{ $active?: boolean; $hasFile?: boolean }>`
  margin-top: 0.75rem;
  border: 1px dashed ${p => p.$hasFile ? p.theme.colors.green : p.$active ? p.theme.colors.primary : p.theme.colors.border};
  border-radius: 10px;
  padding: 1rem;
  text-align: center;
  cursor: pointer;
  background: ${p => p.$hasFile ? p.theme.colors.green + '08' : p.$active ? p.theme.colors.primary + '08' : 'transparent'};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  &:hover {
    border-color: ${p => p.theme.colors.primary}66;
    background: ${p => p.theme.colors.primary}08;
  }
`;

const UploadLabel = styled.div`
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
`;

const UploadPreview = styled.img`
  width: 100%;
  max-height: 120px;
  object-fit: cover;
  border-radius: 7px;
  margin-bottom: 0.5rem;
`;

const UploadStatus = styled.div<{ $color?: string }>`
  font-size: 0.72rem;
  color: ${p => p.$color || p.theme.colors.textMuted};
  margin-top: 0.25rem;
`;

const JobList = styled.div`
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const JobItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  background: ${p => p.theme.colors.surfaceHigh};
  border-radius: 8px;
  border: 1px solid ${p => p.theme.colors.border};
`;

const JobThumb = styled.img`
  width: 36px;
  height: 36px;
  object-fit: cover;
  border-radius: 5px;
  flex-shrink: 0;
`;

const JobInfo = styled.div`
  flex: 1;
  overflow: hidden;
`;

const JobName = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const JobMeta = styled.div`
  font-size: 0.68rem;
  color: ${p => p.theme.colors.textMuted};
  margin-top: 0.15rem;
`;

const JobProgressBar = styled.div<{ $pct: number }>`
  height: 3px;
  background: ${p => p.theme.colors.border};
  border-radius: 2px;
  margin-top: 0.3rem;
  overflow: hidden;
  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${p => p.$pct}%;
    background: linear-gradient(90deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.green});
    border-radius: 2px;
    transition: width 0.4s ease;
  }
`;

const JobCancelBtn = styled.button`
  font-size: 0.62rem;
  font-weight: 600;
  padding: 0.18rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #ef444444;
  background: transparent;
  color: #ef4444;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
  &:hover { background: #ef444418; }
`;

const JobBadge = styled.span<{ $status: string }>`
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: ${p =>
    p.$status === 'done' ? p.theme.colors.green + '22' :
    p.$status === 'failed' ? '#ef444422' :
    p.$status === 'processing' ? p.theme.colors.violet + '22' :
    p.theme.colors.primary + '22'};
  color: ${p =>
    p.$status === 'done' ? p.theme.colors.green :
    p.$status === 'failed' ? '#ef4444' :
    p.$status === 'processing' ? p.theme.colors.violet :
    p.theme.colors.primaryLight};
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
`;

const SettingItem = styled.div``;

const SettingLabel = styled.div`
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.3rem;
  font-weight: 500;
`;

const Select = styled.select`
  width: 100%;
  background: ${p => p.theme.colors.background};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  font-size: 0.8rem;
  color: ${p => p.theme.colors.text};
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${p => p.theme.colors.primary}; }
`;

const StyleTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
`;

const StyleTag = styled.button<{ $active?: boolean; $accent?: string }>`
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: ${p => p.$active
    ? `${p.$accent || p.theme.colors.primary}22`
    : 'transparent'};
  border: 1px solid ${p => p.$active
    ? (p.$accent || p.theme.colors.primary)
    : p.theme.colors.border};
  color: ${p => p.$active
    ? (p.$accent || p.theme.colors.primaryLight)
    : p.theme.colors.textMuted};
  &:hover {
    border-color: ${p => p.$accent || p.theme.colors.primary};
    color: ${p => p.$accent || p.theme.colors.primaryLight};
  }
`;

const ForgeBtn = styled.button<{ $disabled?: boolean }>`
  width: calc(100% - 2.5rem);
  margin: 0 1.25rem 1.25rem;
  padding: 0.85rem;
  background: ${p => p.$disabled
    ? p.theme.colors.surfaceHigh
    : `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`};
  border: 1px solid ${p => p.$disabled ? p.theme.colors.border : 'transparent'};
  border-radius: 10px;
  color: ${p => p.$disabled ? p.theme.colors.textMuted : '#fff'};
  font-size: 0.9rem;
  font-weight: 700;
  cursor: ${p => p.$disabled ? 'not-allowed' : 'pointer'};
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  transition: all 0.2s;
  &:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
`;

const GuestBanner = styled.div`
  margin: 0 1.25rem 1.25rem;
  padding: 0.85rem;
  background: ${p => p.theme.colors.primary}12;
  border: 1px solid ${p => p.theme.colors.primary}33;
  border-radius: 10px;
  font-size: 0.8rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.5;
  text-align: center;
`;

const GuestSignIn = styled(Link)`
  color: ${p => p.theme.colors.primaryLight};
  font-weight: 600;
  &:hover { text-decoration: underline; }
`;

const CreditWarn = styled.div`
  margin: 0 1.25rem 1.25rem;
  padding: 0.75rem;
  background: ${p => p.theme.colors.primary}10;
  border: 1px solid ${p => p.theme.colors.primary}33;
  border-radius: 8px;
  font-size: 0.78rem;
  color: ${p => p.theme.colors.primaryLight};
  display: flex; align-items: center; gap: 0.5rem;
`;

const Divider = styled.div`
  height: 1px;
  background: ${p => p.theme.colors.border};
  margin: 1rem 0;
`;

const CreditBar = styled.div`
  margin: 0 1.25rem 1.25rem;
`;

const CreditLabel = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.4rem;
`;

const BarTrack = styled.div`
  height: 4px;
  background: ${p => p.theme.colors.border};
  border-radius: 999px;
  overflow: hidden;
`;

const BarFill = styled.div<{ $pct: number; $color: string }>`
  height: 100%;
  width: ${p => p.$pct}%;
  background: ${p => p.$color};
  border-radius: 999px;
  animation: ${progressFill} 1s ease both;
  --fill: ${p => p.$pct}%;
`;

// ── Viewport ──────────────────────────────────────────────────────────────────

const Viewport = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ViewTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.6rem 1.25rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
`;

const Tab = styled.button<{ $active?: boolean }>`
  padding: 0.35rem 0.9rem;
  border-radius: 6px;
  border: none;
  background: ${p => p.$active ? p.theme.colors.surfaceHigh : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  font-size: 0.8rem;
  font-weight: ${p => p.$active ? 600 : 400};
  cursor: pointer;
  transition: all 0.15s;
  &:hover { background: ${p => p.theme.colors.surfaceHigh}; color: ${p => p.theme.colors.text}; }
`;

const Canvas = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
  background: ${p => p.theme.colors.background};
  display: flex;
  align-items: center;
  justify-content: center;
`;

// Empty state
const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
  animation: ${fadeIn} 0.5s ease;
`;

const EmptyIcon = styled.div`
  font-size: 4rem;
  opacity: 0.3;
`;

const EmptyTitle = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
`;

const EmptyDesc = styled.div`
  font-size: 0.85rem;
  color: ${p => p.theme.colors.textMuted};
  opacity: 0.7;
  max-width: 280px;
  line-height: 1.5;
`;

// Generating state
const GeneratingWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  animation: ${fadeIn} 0.4s ease;
`;

const Spinner = styled.div`
  width: 80px; height: 80px;
  border-radius: 50%;
  border: 2px solid ${p => p.theme.colors.border};
  border-top-color: ${p => p.theme.colors.primary};
  animation: ${spin} 1s linear infinite;
`;

const GenStatus = styled.div`
  font-size: 0.9rem;
  color: ${p => p.theme.colors.textMuted};
`;

const GenPct = styled.div`
  font-family: 'Orbitron', monospace;
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: ${shimmer} 2s linear infinite;
  background-size: 200% auto;
`;

// Result state
const ResultMesh = styled.div`
  width: 360px; height: 360px;
  border-radius: 16px;
  border: 1px solid ${p => p.theme.colors.border};
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}22, ${p => p.theme.colors.violet}18);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 6rem;
  position: relative;
  overflow: hidden;
  animation: ${fadeIn} 0.6s ease;
`;

const ResultOverlay = styled.div`
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(to top, #000000cc, transparent);
  padding: 1.25rem 1rem 1rem;
`;

const ResultName = styled.div`
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  margin-bottom: 0.25rem;
`;

const ResultMeta = styled.div`
  font-size: 0.72rem;
  color: rgba(255,255,255,0.6);
`;

const ResultActions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;

const ActionBtn = styled.button<{ $variant?: 'primary' | 'outline' }>`
  flex: 1;
  padding: 0.65rem;
  border-radius: 9px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: ${p => p.$variant === 'primary'
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  border: 1px solid ${p => p.$variant === 'primary'
    ? 'transparent'
    : p.theme.colors.border};
  color: ${p => p.$variant === 'primary' ? '#fff' : p.theme.colors.textMuted};
  &:hover {
    opacity: 0.85;
    color: ${p => p.$variant === 'primary' ? '#fff' : p.theme.colors.text};
  }
`;

// ── Right Panel — Recent ──────────────────────────────────────────────────────

const RightPanel = styled.div`
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  overflow-y: auto;
`;

const RPSection = styled.div`
  padding: 1.25rem 1rem 0;
`;

const RPTitle = styled.div`
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.85rem;
`;

const MeshCard = styled.div<{ $accent?: string }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 0.35rem;
  border: 1px solid transparent;
  &:hover {
    background: ${p => p.theme.colors.surfaceHigh};
    border-color: ${p => p.$accent ? `${p.$accent}33` : p.theme.colors.border};
  }
`;

const MeshThumb = styled.div<{ $color1: string; $color2: string }>`
  width: 40px; height: 40px;
  border-radius: 8px;
  background: linear-gradient(135deg, ${p => p.$color1}44, ${p => p.$color2}33);
  display: flex; align-items: center; justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
`;

const MeshInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const MeshName = styled.div`
  font-size: 0.8rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MeshMeta = styled.div`
  font-size: 0.7rem;
  color: ${p => p.theme.colors.textMuted};
  margin-top: 0.1rem;
`;

const StatusDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: ${p => p.$color};
  margin-right: 3px;
  animation: ${pulse} 2s ease infinite;
`;

const LockOverlay = styled.div`
  margin: 1rem;
  padding: 1rem;
  background: ${p => p.theme.colors.surfaceHigh};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  text-align: center;
`;

const LockIcon = styled.div`
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
`;

const LockText = styled.div`
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.5;
  margin-bottom: 0.75rem;
`;

const LockBtn = styled(Link)`
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  color: #fff;
  padding: 0.4rem 1rem;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border-radius: 7px;
  transition: opacity 0.15s;
  &:hover { opacity: 0.85; }
`;

// ── Data ──────────────────────────────────────────────────────────────────────

const STYLES = [
  { label: 'Realistic', accent: '#7c3aed' },
  { label: 'Stylised', accent: '#8b5cf6' },
  { label: 'Low-poly', accent: '#10b981' },
  { label: 'Sculpted', accent: '#7c3aed' },
  { label: 'Sci-fi', accent: '#8b5cf6' },
  { label: 'Organic', accent: '#10b981' },
];

const RECENT_MESHES = [
  { name: 'Dragon bust', meta: '287k polys · 2h ago', emoji: '🐲', c1: '#8b5cf6', c2: '#7c3aed', status: 'done' },
  { name: 'Sci-fi helmet', meta: '142k polys · 5h ago', emoji: '⚙', c1: '#10b981', c2: '#7c3aed', status: 'done' },
  { name: 'Crystal shard', meta: '64k polys · yesterday', emoji: '💎', c1: '#8b5cf6', c2: '#10b981', status: 'done' },
  { name: 'Forest terrain', meta: '512k polys · yesterday', emoji: '🌿', c1: '#10b981', c2: '#6b7280', status: 'done' },
];

type GenState = 'idle' | 'generating' | 'done';

// ── Admin Panel ───────────────────────────────────────────────────────────────

const AdminWrap = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
`;

const AdminTitle = styled.h2`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  margin-bottom: 0.25rem;
`;

const AdminSub = styled.div`
  font-size: 0.8rem;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 1.75rem;
`;

const AdminTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
`;

const ATHead = styled.thead`
  th {
    text-align: left;
    padding: 0.6rem 0.9rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${p => p.theme.colors.textMuted};
    border-bottom: 1px solid ${p => p.theme.colors.border};
  }
`;

const ATBody = styled.tbody`
  tr {
    border-bottom: 1px solid ${p => p.theme.colors.border}55;
    transition: background 0.12s;
    &:hover { background: ${p => p.theme.colors.surfaceHigh}; }
  }
  td {
    padding: 0.75rem 0.9rem;
    color: ${p => p.theme.colors.text};
    vertical-align: middle;
  }
`;

const AThumb = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  display: block;
`;

const AStatusBadge = styled.span<{ $s: string }>`
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.22rem 0.6rem;
  border-radius: 4px;
  background: ${p =>
    p.$s === 'done' ? '#10b98122' :
    p.$s === 'failed' ? '#ef444422' :
    p.$s === 'processing' ? '#8b5cf622' : '#7c3aed22'};
  color: ${p =>
    p.$s === 'done' ? '#10b981' :
    p.$s === 'failed' ? '#ef4444' :
    p.$s === 'processing' ? '#a78bfa' : '#c4b5fd'};
`;

const AActionBtn = styled.button`
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
  border-radius: 5px;
  border: 1px solid ${p => p.theme.colors.border};
  background: transparent;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  margin-right: 0.35rem;
  transition: all 0.12s;
  &:hover { border-color: ${p => p.theme.colors.primary}; color: ${p => p.theme.colors.primaryLight}; }
`;

const AdminFilter = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
`;

const AFilterBtn = styled.button<{ $active?: boolean }>`
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.35rem 0.9rem;
  border-radius: 6px;
  border: 1px solid ${p => p.$active ? p.theme.colors.primary : p.theme.colors.border};
  background: ${p => p.$active ? p.theme.colors.primary + '18' : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.primaryLight : p.theme.colors.textMuted};
  cursor: pointer;
  transition: all 0.12s;
`;

// ── Component ─────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const logout = () => signOutUser().then(() => window.location.href = '/');
  const { appUser, refresh } = useAppUser();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'generate' | 'history' | 'settings'>('generate');
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('Realistic');
  const [polygonBudget, setPolygonBudget] = useState('Medium (50k-200k)');
  const [textureRes, setTextureRes] = useState('1K');
  const [exportFormat, setExportFormat] = useState('GLB');
  const [detailLevel, setDetailLevel] = useState('Standard');
  const [doTexture, setDoTexture] = useState(false);
  const [genState, setGenState] = useState<GenState>('idle');
  const [genPct, setGenPct] = useState(0);
  const [activeNavItem, setActiveNavItem] = useState('forge');

  const email = user?.email || '';
  const isGuest = !isAuthenticated;
  const isFree = appUser.role === 'free';
  const isPro = appUser.role === 'pro';
  const isAdmin = appUser.role === 'admin';
  const credits = isGuest ? 0 : appUser.credits;
  const maxCredits = isFree ? 10 : isPro ? 200 : 0;
  const creditPct = maxCredits > 0 ? Math.round((credits / maxCredits) * 100) : 0;

  // Register user in DB + load their role on login
  const loginCalledRef = React.useRef(false);
  React.useEffect(() => {
    if (!isAuthenticated || !email || loginCalledRef.current) return;
    loginCalledRef.current = true;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: user?.displayName || '', picture: user?.photoURL || '' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.user) refresh(email);
      })
      .catch(() => { loginCalledRef.current = false; });
  }, [isAuthenticated, email]);

  // Admin state
  const [adminJobs, setAdminJobs] = useState<any[]>([]);
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending'>('all');

  React.useEffect(() => {
    if (!isAdmin || !email) return;
    fetch(`/api/admin/jobs?filter=${adminFilter}`, {
      headers: { 'x-user-email': email },
    })
      .then(r => r.json())
      .then(d => setAdminJobs(d.jobs || []))
      .catch(() => {});
  }, [isAdmin, email, adminFilter]);

  const handleUpdateJobStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/jobs/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-email': email },
      body: JSON.stringify({ status }),
    });
    setAdminJobs(prev => prev.map(j => j.id === id ? { ...j, status } : j));
  };

  // Upload state
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  // Load jobs on mount
  React.useEffect(() => {
    if (!email) return;
    fetch(`/api/jobs?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => setJobs(d.jobs || []))
      .catch(() => {});
  }, [email]);

  // Poll jobs every 10s to pick up worker progress updates
  React.useEffect(() => {
    if (!email) return;
    const id = setInterval(() => {
      fetch(`/api/jobs?email=${encodeURIComponent(email)}`)
        .then(r => r.json())
        .then(d => setJobs(d.jobs || []))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [email]);

  const handleCancel = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, requestCancel: true } : j));
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setUploadStatus('idle');
  };

  const handleUpload = async () => {
    if (!uploadFile || !email || uploadStatus === 'uploading') return;
    setUploadStatus('uploading');
    const form = new FormData();
    form.append('image', uploadFile);
    form.append('email', email);
    form.append('prompt', prompt);
    form.append('style', selectedStyle);
    form.append('polygonBudget', polygonBudget);
    form.append('textureRes', textureRes);
    form.append('exportFormat', exportFormat);
    form.append('detailLevel', detailLevel);
    form.append('doTexture', String(doTexture));
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJobs(prev => [data.job, ...prev]);
      setUploadStatus('done');
    } catch {
      setUploadStatus('error');
    }
  };

  const handleForge = () => {
    if (isGuest || !prompt.trim()) return;
    setGenState('generating');
    setGenPct(0);
    const interval = setInterval(() => {
      setGenPct(p => {
        if (p >= 97) { clearInterval(interval); return 97; }
        return p + Math.floor(Math.random() * 8) + 2;
      });
    }, 400);
    setTimeout(() => {
      clearInterval(interval);
      setGenPct(100);
      setGenState('done');
    }, 7000);
  };

  const displayName = isGuest ? 'Guest' : (user?.displayName || user?.email?.split('@')[0] || 'User');
  const roleLabel = isGuest ? 'guest' : appUser.role;

  return (
    <Shell>
      {/* ── Sidebar ── */}
      <Sidebar>
        <SidebarTop>
          <Brand to="/">
            <BrandIcon>⬡</BrandIcon>
            GENSHAPE3D
          </Brand>
        </SidebarTop>

        <SideNav>
          <SideGroup>
            <SideGroupLabel>Workspace</SideGroupLabel>
            {[
              { id: 'forge', icon: '⚡', label: 'Forge' },
              { id: 'gallery', icon: '⬡', label: 'My meshes' },
              { id: 'history', icon: '◷', label: 'History' },
            ].map(item => (
              <NavItem
                key={item.id}
                $active={activeNavItem === item.id}
                $accent={item.id === 'forge' ? '#7c3aed' : undefined}
                onClick={() => setActiveNavItem(item.id)}
              >
                <NavIcon>{item.icon}</NavIcon>
                {item.label}
              </NavItem>
            ))}
          </SideGroup>

          <SideGroup>
            <SideGroupLabel>Explore</SideGroupLabel>
            {[
              { id: 'community', icon: '◈', label: 'Community' },
              { id: 'templates', icon: '◇', label: 'Templates' },
              { id: 'docs', icon: '◉', label: 'Docs & API' },
            ].map(item => (
              <NavItem
                key={item.id}
                $active={activeNavItem === item.id}
                onClick={() => setActiveNavItem(item.id)}
              >
                <NavIcon>{item.icon}</NavIcon>
                {item.label}
              </NavItem>
            ))}
          </SideGroup>

          {isAdmin && (
            <SideGroup>
              <SideGroupLabel>Admin</SideGroupLabel>
              <NavItem
                $active={activeNavItem === 'admin'}
                $accent="#f59e0b"
                onClick={() => setActiveNavItem('admin')}
              >
                <NavIcon>⚠</NavIcon>
                Jobs Queue
              </NavItem>
            </SideGroup>
          )}

          {!isGuest && (
            <SideGroup>
              <SideGroupLabel>Account</SideGroupLabel>
              <NavItem
                $active={activeNavItem === 'settings'}
                onClick={() => setActiveNavItem('settings')}
              >
                <NavIcon>⚙</NavIcon>
                Settings
              </NavItem>
              <NavItem onClick={() => logout()}>
                <NavIcon>↩</NavIcon>
                Sign out
              </NavItem>
            </SideGroup>
          )}

          {isGuest && (
            <NavItem onClick={() => navigate('/login')}>
              <NavIcon>→</NavIcon>
              Sign in / Register
            </NavItem>
          )}
        </SideNav>

        <SidebarBottom>
          <UserChip>
            <Avatar $src={user?.photoURL}>
              {!user?.photoURL && displayName[0].toUpperCase()}
            </Avatar>
            <UserInfo>
              <UserName>{displayName}</UserName>
              <UserRole $role={roleLabel}>{roleLabel}</UserRole>
            </UserInfo>
          </UserChip>
        </SidebarBottom>
      </Sidebar>

      {/* ── Main ── */}
      <Main>
        {/* Topbar */}
        <Topbar>
          <TopbarLeft>
            <PageTitle>Forge</PageTitle>
            <Breadcrumb>/ Text to 3D</Breadcrumb>
          </TopbarLeft>
          <TopbarRight>
            {!isGuest && (
              <CreditPill $warn={credits <= 2 && isFree}>
                ⚡ {isGuest ? 0 : credits} credits
              </CreditPill>
            )}
            {isFree && <UpgradeBtn to="#">Upgrade to Pro</UpgradeBtn>}
            {isGuest && <UpgradeBtn to="/login">Sign in free</UpgradeBtn>}
            <IconBtn title="Notifications">🔔</IconBtn>
            <IconBtn title="Help">?</IconBtn>
          </TopbarRight>
        </Topbar>

        <Body>
          {/* ── Admin Panel ── */}
          {activeNavItem === 'admin' && isAdmin && (
            <AdminWrap>
              <AdminTitle>Jobs Queue</AdminTitle>
              <AdminSub>Review and manage incoming generation requests.</AdminSub>
              <AdminFilter>
                <AFilterBtn $active={adminFilter === 'pending'} onClick={() => setAdminFilter('pending')}>Pending</AFilterBtn>
                <AFilterBtn $active={adminFilter === 'all'} onClick={() => setAdminFilter('all')}>All jobs</AFilterBtn>
              </AdminFilter>
              <AdminTable>
                <ATHead>
                  <tr>
                    <th>Image</th>
                    <th>User</th>
                    <th>Prompt</th>
                    <th>Style</th>
                    <th>Polys</th>
                    <th>Tex</th>
                    <th>Format</th>
                    <th>Detail</th>
                    <th>Texture</th>
                    <th>Progress</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </ATHead>
                <ATBody>
                  {adminJobs.length === 0 && (
                    <tr><td colSpan={13} style={{ textAlign: 'center', opacity: 0.4, padding: '2rem' }}>No jobs found</td></tr>
                  )}
                  {adminJobs.map(job => {
                    const key = job.imageUrl ? job.imageUrl.split('/uploads/')[1] : null;
                    const proxyUrl = key ? `/api/image?key=uploads/${key}` : null;
                    return (
                    <tr key={job.id}>
                      <td>{proxyUrl ? <AThumb src={proxyUrl} alt="" /> : '—'}</td>
                      <td>{job.userEmail}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.prompt || '—'}</td>
                      <td>{job.style}</td>
                      <td style={{ fontSize: '0.7rem', opacity: 0.8 }}>{job.polygonBudget || '—'}</td>
                      <td style={{ fontSize: '0.7rem', opacity: 0.8 }}>{job.textureRes || '—'}</td>
                      <td style={{ fontSize: '0.7rem', opacity: 0.8 }}>{job.exportFormat || '—'}</td>
                      <td style={{ fontSize: '0.7rem', opacity: 0.8 }}>{job.detailLevel || '—'}</td>
                      <td style={{ fontSize: '0.7rem' }}>{job.doTexture ? '✓' : '—'}</td>
                      <td style={{ fontSize: '0.7rem' }}>
                        {job.progressPct > 0 && `${job.progressPct}%`}
                        {job.progressPhase && ` ${job.progressPhase}`}
                        {!job.progressPct && !job.progressPhase && '—'}
                      </td>
                      <td><AStatusBadge $s={job.requestCancel ? 'failed' : job.status}>{job.requestCancel ? 'cancelling' : job.status}</AStatusBadge></td>
                      <td style={{ opacity: 0.5, fontSize: '0.72rem' }}>{new Date(job.createdAt).toLocaleString()}</td>
                      <td>
                        {job.status === 'pending' && (
                          <AActionBtn onClick={() => handleUpdateJobStatus(job.id, 'processing')}>Start</AActionBtn>
                        )}
                        {job.status === 'processing' && (
                          <AActionBtn onClick={() => handleUpdateJobStatus(job.id, 'done')}>Mark done</AActionBtn>
                        )}
                        {job.status === 'failed' && (
                          <AActionBtn onClick={() => handleUpdateJobStatus(job.id, 'pending')}>↺ Retry</AActionBtn>
                        )}
                        {job.status !== 'failed' && (
                          <AActionBtn onClick={() => handleUpdateJobStatus(job.id, 'failed')}>Fail</AActionBtn>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </ATBody>
              </AdminTable>
            </AdminWrap>
          )}

          {/* ── Generator Panel ── */}
          {activeNavItem !== 'admin' && <GenPanel>
            <PanelSection>
              <PanelTitle>Prompt</PanelTitle>
              <PromptBox
                placeholder={isGuest
                  ? 'Sign in to start generating 3D meshes…'
                  : 'Describe your 3D object in detail. E.g. "A weathered stone gargoyle perched on a gothic arch, moss-covered base, dramatic pose"'}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                disabled={isGuest}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />
              <UploadZone
                $active={dragOver}
                $hasFile={!!uploadFile}
                onClick={() => !isGuest && fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); if (!isGuest) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  if (!isGuest) {
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileSelect(file);
                  }
                }}
              >
                {uploadPreview ? (
                  <>
                    <UploadPreview src={uploadPreview} alt="preview" />
                    <UploadStatus $color={
                      uploadStatus === 'done' ? '#10b981' :
                      uploadStatus === 'error' ? '#ef4444' :
                      uploadStatus === 'uploading' ? '#8b5cf6' : undefined
                    }>
                      {uploadStatus === 'uploading' ? '⏳ Uploading…' :
                       uploadStatus === 'done' ? '✓ Uploaded — job created' :
                       uploadStatus === 'error' ? '✕ Upload failed' :
                       `${uploadFile?.name} · Click "Forge Mesh" to submit`}
                    </UploadStatus>
                  </>
                ) : (
                  <UploadLabel>
                    {isGuest ? '🔒 Sign in to upload images' : '📎 Drop an image or click to upload'}
                  </UploadLabel>
                )}
              </UploadZone>

              {jobs.length > 0 && (
                <JobList>
                  {jobs.slice(0, 5).map(job => {
                    const isProcessing = job.status === 'processing';
                    const phase = job.progressPhase
                      ? `${job.progressPhase}${job.progressTotal > 0 ? ` ${job.progressStep}/${job.progressTotal}` : ''}`
                      : job.status;
                    const duration = job.startedAt && job.completedAt
                      ? `${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s`
                      : null;
                    return (
                      <JobItem key={job.id}>
                        {job.imageUrl && <JobThumb src={`/api/image?key=uploads/${job.imageUrl.split('/uploads/')[1]}`} alt="" />}
                        <JobInfo>
                          <JobName>{job.prompt || 'Image upload'}</JobName>
                          <JobMeta>
                            {phase}
                            {duration && ` · ${duration}`}
                          </JobMeta>
                          {isProcessing && <JobProgressBar $pct={job.progressPct || 0} />}
                        </JobInfo>
                        {isProcessing && !job.requestCancel && (
                          <JobCancelBtn onClick={() => handleCancel(job.id)}>Cancel</JobCancelBtn>
                        )}
                        {job.requestCancel && (
                          <JobBadge $status="pending">cancelling…</JobBadge>
                        )}
                        {!job.requestCancel && (
                          <JobBadge $status={job.status}>{job.status}</JobBadge>
                        )}
                      </JobItem>
                    );
                  })}
                </JobList>
              )}
            </PanelSection>

            <Divider />

            <PanelSection>
              <PanelTitle>Style</PanelTitle>
              <StyleTags>
                {STYLES.map(s => (
                  <StyleTag
                    key={s.label}
                    $active={selectedStyle === s.label}
                    $accent={s.accent}
                    onClick={() => !isGuest && setSelectedStyle(s.label)}
                    disabled={isGuest}
                  >
                    {s.label}
                  </StyleTag>
                ))}
              </StyleTags>
            </PanelSection>

            <PanelSection>
              <PanelTitle>Settings</PanelTitle>
              <SettingsGrid>
                <SettingItem>
                  <SettingLabel>Polygon budget</SettingLabel>
                  <Select disabled={isGuest} value={polygonBudget} onChange={e => setPolygonBudget(e.target.value)}>
                    <option value="Low (10k-50k)">Low (10k-50k)</option>
                    <option value="Medium (50k-200k)">Medium (50k-200k)</option>
                    {isPro && <option value="High (200k-1M)">High (200k-1M)</option>}
                  </Select>
                </SettingItem>
                <SettingItem>
                  <SettingLabel>Texture res.</SettingLabel>
                  <Select disabled={isGuest} value={textureRes} onChange={e => setTextureRes(e.target.value)}>
                    <option>1K</option>
                    <option>2K</option>
                    {isPro && <option>4K</option>}
                  </Select>
                </SettingItem>
                <SettingItem>
                  <SettingLabel>Export format</SettingLabel>
                  <Select disabled={isGuest} value={exportFormat} onChange={e => setExportFormat(e.target.value)}>
                    <option>GLB</option>
                    <option>OBJ</option>
                    {isPro && <option>FBX</option>}
                    {isPro && <option>USDZ</option>}
                  </Select>
                </SettingItem>
                <SettingItem>
                  <SettingLabel>Detail level</SettingLabel>
                  <Select disabled={isGuest} value={detailLevel} onChange={e => setDetailLevel(e.target.value)}>
                    <option>Standard</option>
                    {!isGuest && <option>Fine</option>}
                    {isPro && <option>Ultra</option>}
                  </Select>
                </SettingItem>
                <SettingItem style={{ gridColumn: '1 / -1' }}>
                  <SettingLabel>Generate textures</SettingLabel>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isGuest ? 'not-allowed' : 'pointer', fontSize: '0.82rem' }}>
                    <input
                      type="checkbox"
                      checked={doTexture}
                      disabled={isGuest}
                      onChange={e => setDoTexture(e.target.checked)}
                      style={{ accentColor: '#7c3aed', width: 14, height: 14 }}
                    />
                    Include PBR texture maps with mesh
                  </label>
                </SettingItem>
              </SettingsGrid>
            </PanelSection>

            <Divider />

            {isGuest ? (
              <GuestBanner>
                🔒 Generation is locked for guests.<br />
                <GuestSignIn to="/login">Sign in for free</GuestSignIn> to start forging 3D meshes.
              </GuestBanner>
            ) : credits === 0 && isFree ? (
              <CreditWarn>
                ⚠ No credits left. <Link to="#" style={{ color: 'inherit', fontWeight: 700 }}>Upgrade to Pro</Link>
              </CreditWarn>
            ) : null}

            <ForgeBtn
              $disabled={isGuest || (!prompt.trim() && !uploadFile) || genState === 'generating' || uploadStatus === 'uploading' || (credits === 0 && isFree)}
              onClick={() => { if (uploadFile && uploadStatus !== 'done') handleUpload(); else handleForge(); }}
            >
              {genState === 'generating' ? (
                <><span style={{ animation: `${spin} 1s linear infinite`, display: 'inline-block' }}>⬡</span> Forging…</>
              ) : '⚡ Forge Mesh'}
            </ForgeBtn>

            {!isGuest && (
              <CreditBar>
                <CreditLabel>
                  <span>Credits used</span>
                  <span>{maxCredits - credits} / {maxCredits}</span>
                </CreditLabel>
                <BarTrack>
                  <BarFill
                    $pct={100 - creditPct}
                    $color={creditPct > 30 ? '#10b981' : '#7c3aed'}
                  />
                </BarTrack>
              </CreditBar>
            )}
          </GenPanel>}

          {/* ── Viewport ── */}
          {activeNavItem !== 'admin' && <Viewport>
            <ViewTabs>
              <Tab $active={activeTab === 'generate'} onClick={() => setActiveTab('generate')}>3D View</Tab>
              <Tab $active={activeTab === 'history'} onClick={() => setActiveTab('history')}>Texture maps</Tab>
              <Tab $active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Wireframe</Tab>
            </ViewTabs>

            <Canvas>
              {genState === 'idle' && (
                <EmptyState>
                  <EmptyIcon>⬡</EmptyIcon>
                  <EmptyTitle>
                    {isGuest ? 'Sign in to generate' : 'Your mesh will appear here'}
                  </EmptyTitle>
                  <EmptyDesc>
                    {isGuest
                      ? 'Create a free account to start generating stunning 3D meshes from text or images.'
                      : 'Write a prompt on the left panel and click Forge Mesh to start generating your 3D model.'}
                  </EmptyDesc>
                </EmptyState>
              )}

              {genState === 'generating' && (
                <GeneratingWrap>
                  <Spinner />
                  <GenPct>{Math.min(genPct, 97)}%</GenPct>
                  <GenStatus>
                    {genPct < 20 ? 'Interpreting prompt…'
                     : genPct < 45 ? 'Generating base geometry…'
                     : genPct < 70 ? 'Refining topology…'
                     : genPct < 88 ? 'Applying textures…'
                     : 'Finalising mesh…'}
                  </GenStatus>
                </GeneratingWrap>
              )}

              {genState === 'done' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
                  <ResultMesh>
                    🐲
                    <ResultOverlay>
                      <ResultName>{prompt || 'Generated mesh'}</ResultName>
                      <ResultMeta>287k polys · GLB · PBR textures · 2K</ResultMeta>
                    </ResultOverlay>
                  </ResultMesh>
                  <ResultActions>
                    <ActionBtn $variant="outline">🔄 Regenerate</ActionBtn>
                    <ActionBtn $variant="outline">✏ Sculpt</ActionBtn>
                    <ActionBtn $variant="primary">⬇ Download GLB</ActionBtn>
                  </ResultActions>
                </div>
              )}
            </Canvas>
          </Viewport>}

          {/* ── Right panel ── */}
          {activeNavItem !== 'admin' && <RightPanel>
            <RPSection>
              <RPTitle>Recent meshes</RPTitle>
            </RPSection>

            {isGuest ? (
              <LockOverlay>
                <LockIcon>🔒</LockIcon>
                <LockText>
                  Sign in to save and access your generated meshes.
                </LockText>
                <LockBtn to="/login">Sign in free</LockBtn>
              </LockOverlay>
            ) : (
              <div style={{ padding: '0 0.5rem' }}>
                {RECENT_MESHES.map(m => (
                  <MeshCard key={m.name} $accent="#7c3aed">
                    <MeshThumb $color1={m.c1} $color2={m.c2}>{m.emoji}</MeshThumb>
                    <MeshInfo>
                      <MeshName>{m.name}</MeshName>
                      <MeshMeta>
                        <StatusDot $color="#10b981" />
                        {m.meta}
                      </MeshMeta>
                    </MeshInfo>
                  </MeshCard>
                ))}
              </div>
            )}

            <Divider style={{ margin: '1rem' }} />

            <RPSection>
              <RPTitle>Quick tips</RPTitle>
              {[
                'Be specific about materials and surfaces',
                'Mention scale — micro vs macro affects topology',
                'Use style tags to guide the AI aesthetic',
              ].map(tip => (
                <div
                  key={tip}
                  style={{
                    fontSize: '0.75rem',
                    lineHeight: '1.5',
                    marginBottom: '0.65rem',
                    paddingLeft: '0.5rem',
                    borderLeft: '2px solid #7c3aed44',
                    color: '#9d93b8',
                  }}
                >
                  {tip}
                </div>
              ))}
            </RPSection>
          </RightPanel>}
        </Body>
      </Main>
    </Shell>
  );
};

export default Dashboard;
