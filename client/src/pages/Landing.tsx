import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';

// ── Animations ────────────────────────────────────────────────────────────────

const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  33% { transform: translateY(-18px) rotate(1deg); }
  66% { transform: translateY(-8px) rotate(-1deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
`;

const rotateMesh = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const scanLine = keyframes`
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
`;

const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
`;

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 20px #7c3aed44, 0 0 60px #7c3aed22; }
  50% { box-shadow: 0 0 40px #7c3aed88, 0 0 100px #7c3aed44; }
`;

// ── Layout ────────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${p => p.theme.colors.background};
  overflow-x: hidden;
`;

// ── Navbar ────────────────────────────────────────────────────────────────────

const Nav = styled.nav`
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2.5rem;
  height: 64px;
  background: ${p => p.theme.colors.background}cc;
  backdrop-filter: blur(20px);
  border-bottom: 1px solid ${p => p.theme.colors.border};
`;

const Brand = styled(Link)`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: 'Orbitron', monospace;
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: ${p => p.theme.colors.text};
`;

const BrandIcon = styled.div`
  width: 32px; height: 32px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
`;

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const NavLink = styled(Link)`
  font-size: 0.85rem;
  font-weight: 500;
  color: ${p => p.theme.colors.textMuted};
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
  &:hover { color: ${p => p.theme.colors.text}; background: ${p => p.theme.colors.surface}; }
`;

const NavActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const StylesDropdownWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const StylesBtn = styled.button`
  font-size: 0.82rem;
  font-weight: 500;
  color: ${p => p.theme.colors.textMuted};
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  &:hover {
    color: ${p => p.theme.colors.text};
    background: ${p => p.theme.colors.surface};
    border-color: ${p => p.theme.colors.border};
  }
`;

const DropdownMenu = styled.div<{ open: boolean }>`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  padding: 0.4rem;
  display: ${p => (p.open ? 'block' : 'none')};
  box-shadow: 0 16px 40px #00000066;
  z-index: 200;
  max-height: 420px;
  overflow-y: auto;
`;

const DropdownItem = styled.a`
  display: block;
  padding: 0.45rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  transition: color 0.12s, background 0.12s;
  text-decoration: none;
  &:hover {
    color: ${p => p.theme.colors.text};
    background: ${p => p.theme.colors.primary}18;
  }
`;

const DropdownLabel = styled.div`
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.primary};
  padding: 0.4rem 0.75rem 0.25rem;
`;

const BtnOutline = styled(Link)`
  font-size: 0.85rem;
  font-weight: 600;
  color: ${p => p.theme.colors.primaryLight};
  padding: 0.45rem 1.1rem;
  border: 1px solid ${p => p.theme.colors.primary}66;
  border-radius: 8px;
  transition: all 0.15s;
  &:hover {
    border-color: ${p => p.theme.colors.primary};
    background: ${p => p.theme.colors.primary}18;
  }
`;

const BtnPrimary = styled(Link)`
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  padding: 0.45rem 1.25rem;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border-radius: 8px;
  transition: opacity 0.15s, transform 0.15s;
  &:hover { opacity: 0.88; transform: translateY(-1px); }
`;

// ── Hero ──────────────────────────────────────────────────────────────────────

const Hero = styled.section`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 7rem 2rem 4rem;
`;

const HeroGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
  max-width: 1200px;
  width: 100%;
  z-index: 2;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    text-align: center;
  }
`;

const HeroLeft = styled.div`
  animation: ${fadeUp} 0.7s ease both;
`;

const HeroBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: ${p => p.theme.colors.primary}18;
  border: 1px solid ${p => p.theme.colors.primary}44;
  border-radius: 999px;
  padding: 0.3rem 0.9rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: ${p => p.theme.colors.primaryLight};
  letter-spacing: 0.04em;
  margin-bottom: 1.5rem;
`;

const BadgeDot = styled.span`
  width: 6px; height: 6px;
  border-radius: 50%;
  background: ${p => p.theme.colors.green};
  animation: ${pulse} 2s ease infinite;
`;

const HeroTitle = styled.h1`
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(2.6rem, 5vw, 4rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: ${p => p.theme.colors.text};
  margin-bottom: 1.5rem;
`;

const GradientText = styled.span`
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet}, ${p => p.theme.colors.green});
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: ${shimmer} 4s linear infinite;
`;

const HeroSubtitle = styled.p`
  font-size: 1.05rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.7;
  max-width: 480px;
  margin-bottom: 2.5rem;
`;

const HeroCTAs = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const CTAPrimary = styled.button`
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  padding: 0.75rem 2rem;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  animation: ${glow} 3s ease infinite;
  &:hover { transform: translateY(-2px); filter: brightness(1.15); }
`;

const CTASecondary = styled.button`
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  padding: 0.75rem 2rem;
  background: transparent;
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  &:hover {
    border-color: ${p => p.theme.colors.borderHigh};
    color: ${p => p.theme.colors.text};
    background: ${p => p.theme.colors.surface};
  }
`;

const HeroStats = styled.div`
  display: flex;
  gap: 2rem;
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid ${p => p.theme.colors.border};
`;

const Stat = styled.div``;

const StatNum = styled.div`
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  color: ${p => p.theme.colors.text};
`;

const StatLabel = styled.div`
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
  margin-top: 0.1rem;
`;

// ── Hero Visual ───────────────────────────────────────────────────────────────

const HeroRight = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeUp} 0.9s ease 0.2s both;
  @media (max-width: 900px) { display: none; }
`;

const MeshContainer = styled.div`
  position: relative;
  width: 480px;
  height: 480px;
`;

const MeshOrb = styled.div`
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 320px; height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%,
    ${p => p.theme.colors.violet}44,
    ${p => p.theme.colors.primary}33,
    transparent 70%
  );
  animation: ${float} 6s ease-in-out infinite;
`;

const MeshRing = styled.div<{ $size: number; $delay?: number; $color?: string }>`
  position: absolute;
  top: 50%; left: 50%;
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid ${p => p.$color || p.theme.colors.primary}44;
  animation: ${rotateMesh} ${p => 8 + (p.$size / 80)}s linear infinite ${p => p.$delay ? `${p.$delay}s` : ''};
`;

const MeshRingInner = styled(MeshRing)`
  animation-direction: reverse;
  border-style: dashed;
`;

const MeshNode = styled.div<{ $x: number; $y: number; $color?: string }>`
  position: absolute;
  left: ${p => p.$x}%;
  top: ${p => p.$y}%;
  width: 8px; height: 8px;
  background: ${p => p.$color || p.theme.colors.primary};
  border-radius: 50%;
  box-shadow: 0 0 12px ${p => p.$color || p.theme.colors.primary};
  animation: ${pulse} ${p => 2 + Math.random() * 2}s ease infinite;
`;

const MeshCanvas = styled.svg`
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  opacity: 0.35;
`;

const ScanLine = styled.div`
  position: absolute;
  left: 10%; right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, ${p => p.theme.colors.green}, transparent);
  animation: ${scanLine} 4s ease-in-out infinite;
`;

const GlassCard = styled.div`
  position: absolute;
  background: ${p => p.theme.colors.surface}bb;
  backdrop-filter: blur(12px);
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 12px;
  padding: 0.75rem 1rem;
  font-size: 0.78rem;
`;

const FloatCard1 = styled(GlassCard)`
  top: 12%; left: -8%;
  animation: ${float} 5s ease-in-out infinite;
`;

const FloatCard2 = styled(GlassCard)`
  bottom: 18%; right: -6%;
  animation: ${float} 7s ease-in-out 1.5s infinite;
`;

const CardLabel = styled.div`
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.7rem;
  margin-bottom: 0.25rem;
`;

const CardValue = styled.div`
  color: ${p => p.theme.colors.text};
  font-weight: 700;
  display: flex; align-items: center; gap: 0.35rem;
`;

const GreenDot = styled.span`
  width: 6px; height: 6px; border-radius: 50%;
  background: ${p => p.theme.colors.green};
  display: inline-block;
`;

const VioletDot = styled.span`
  width: 6px; height: 6px; border-radius: 50%;
  background: ${p => p.theme.colors.violet};
  display: inline-block;
`;

// ── Background FX ─────────────────────────────────────────────────────────────

const BgGlow = styled.div<{ $x: number; $y: number; $color: string; $size: number }>`
  position: absolute;
  left: ${p => p.$x}%;
  top: ${p => p.$y}%;
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  border-radius: 50%;
  background: ${p => p.$color};
  filter: blur(80px);
  opacity: 0.12;
  pointer-events: none;
`;

const GridPattern = styled.div`
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(${p => p.theme.colors.border}44 1px, transparent 1px),
    linear-gradient(90deg, ${p => p.theme.colors.border}44 1px, transparent 1px);
  background-size: 48px 48px;
  opacity: 0.3;
  pointer-events: none;
`;

// ── Section ───────────────────────────────────────────────────────────────────

const Section = styled.section<{ $alt?: boolean }>`
  padding: 6rem 2rem;
  background: ${p => p.$alt ? p.theme.colors.surface : p.theme.colors.background};
  position: relative;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const SectionLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.primary};
  margin-bottom: 0.75rem;
`;

const SectionTitle = styled.h2`
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 800;
  color: ${p => p.theme.colors.text};
  letter-spacing: -0.02em;
  margin-bottom: 1rem;
`;

const SectionDesc = styled.p`
  font-size: 1rem;
  color: ${p => p.theme.colors.textMuted};
  max-width: 540px;
  line-height: 1.7;
`;

const SectionHead = styled.div`
  margin-bottom: 3.5rem;
`;

// ── Features ──────────────────────────────────────────────────────────────────

const FeatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
`;

const FeatCard = styled.div<{ $accent: string }>`
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 16px;
  padding: 2rem;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
  &:hover {
    border-color: ${p => p.$accent}66;
    transform: translateY(-4px);
  }
  &::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, ${p => p.$accent}, transparent);
  }
`;

const FeatIcon = styled.div<{ $accent: string }>`
  width: 48px; height: 48px;
  border-radius: 12px;
  background: ${p => p.$accent}18;
  border: 1px solid ${p => p.$accent}33;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem;
  margin-bottom: 1.25rem;
`;

const FeatTitle = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  margin-bottom: 0.5rem;
`;

const FeatDesc = styled.p`
  font-size: 0.875rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.6;
`;

// ── How it works ──────────────────────────────────────────────────────────────

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1px;
  background: ${p => p.theme.colors.border};
  border-radius: 16px;
  overflow: hidden;
`;

const Step = styled.div`
  background: ${p => p.theme.colors.surface};
  padding: 2.5rem 2rem;
  display: flex; flex-direction: column; gap: 1rem;
`;

const StepNum = styled.div`
  font-family: 'Orbitron', monospace;
  font-size: 2rem;
  font-weight: 900;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const StepTitle = styled.div`
  font-weight: 700;
  color: ${p => p.theme.colors.text};
  font-size: 0.95rem;
`;

const StepDesc = styled.div`
  font-size: 0.85rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.6;
`;

// ── Pricing ───────────────────────────────────────────────────────────────────

const PricingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  @media (max-width: 800px) {
    grid-template-columns: 1fr;
    max-width: 420px;
    margin: 0 auto;
  }
`;

const PricingCard = styled.div<{ $featured?: boolean }>`
  background: ${p => p.$featured ? 'linear-gradient(135deg, #1a1035, #120d28)' : p.theme.colors.surface};
  border: 1px solid ${p => p.$featured ? p.theme.colors.primary + '88' : p.theme.colors.border};
  border-radius: 20px;
  padding: 2.5rem 2rem;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s;
  ${p => p.$featured && `
    transform: scale(1.04);
    box-shadow: 0 0 60px ${p.theme.colors.primary}22;
  `}
  &:hover { transform: ${p => p.$featured ? 'scale(1.06)' : 'translateY(-4px)'}; }
`;

const PricingBadge = styled.div`
  position: absolute;
  top: -1px; left: 50%; transform: translateX(-50%);
  background: linear-gradient(90deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.25rem 1rem;
  border-radius: 0 0 8px 8px;
`;

const PricingTier = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.75rem;
`;

const PricingPrice = styled.div`
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2.8rem;
  font-weight: 800;
  color: ${p => p.theme.colors.text};
  margin-bottom: 0.25rem;
  display: flex; align-items: flex-start; gap: 0.25rem;
  sup { font-size: 1.2rem; margin-top: 0.6rem; }
`;

const PricingPer = styled.div`
  font-size: 0.8rem;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 1.75rem;
`;

const PricingFeatures = styled.ul`
  list-style: none;
  display: flex; flex-direction: column; gap: 0.75rem;
  margin-bottom: 2rem;
`;

const PricingFeature = styled.li<{ $disabled?: boolean }>`
  display: flex; align-items: center; gap: 0.6rem;
  font-size: 0.875rem;
  color: ${p => p.$disabled ? p.theme.colors.textMuted : p.theme.colors.text};
  opacity: ${p => p.$disabled ? 0.5 : 1};
`;

const CheckIcon = styled.span<{ $color?: string }>`
  width: 18px; height: 18px;
  border-radius: 50%;
  background: ${p => (p.$color || p.theme.colors.green)}22;
  border: 1px solid ${p => (p.$color || p.theme.colors.green)}44;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.65rem;
  color: ${p => p.$color || p.theme.colors.green};
  flex-shrink: 0;
`;

const XIcon = styled(CheckIcon)`
  background: ${p => p.theme.colors.grey}18;
  border-color: ${p => p.theme.colors.grey}33;
  color: ${p => p.theme.colors.grey};
`;

const PricingCTA = styled.button<{ $featured?: boolean }>`
  width: 100%;
  padding: 0.75rem;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  background: ${p => p.$featured
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  border: 1px solid ${p => p.$featured ? 'transparent' : p.theme.colors.border};
  color: ${p => p.$featured ? '#fff' : p.theme.colors.textMuted};
  &:hover {
    background: ${p => p.$featured
      ? `linear-gradient(135deg, ${p.theme.colors.violet}, ${p.theme.colors.primary})`
      : p.theme.colors.surfaceHigh};
    color: ${p => p.$featured ? '#fff' : p.theme.colors.text};
    border-color: ${p => p.$featured ? 'transparent' : p.theme.colors.borderHigh};
  }
`;

// ── Gallery Preview ───────────────────────────────────────────────────────────

const GalleryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  @media (max-width: 900px) { grid-template-columns: repeat(2, 1fr); }
`;

const GalleryItem = styled.div<{ $accent: string }>`
  aspect-ratio: 1;
  border-radius: 16px;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  overflow: hidden;
  position: relative;
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
  &:hover { transform: scale(1.03); border-color: ${p => p.$accent}88; }
`;

const GalleryItemInner = styled.div<{ $color1: string; $color2: string }>`
  width: 100%; height: 100%;
  background: linear-gradient(135deg, ${p => p.$color1}22, ${p => p.$color2}18);
  display: flex; align-items: center; justify-content: center;
  font-size: 3rem;
`;

const GalleryLabel = styled.div`
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(to top, #000000cc, transparent);
  padding: 1rem 0.75rem 0.75rem;
  font-size: 0.75rem;
  color: #fff;
  font-weight: 500;
`;

// ── Footer ────────────────────────────────────────────────────────────────────

const Footer = styled.footer`
  padding: 3rem 2rem;
  border-top: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
`;

const FooterInner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
`;

const FooterBrand = styled.div`
  font-family: 'Orbitron', monospace;
  font-size: 1rem;
  font-weight: 800;
  color: ${p => p.theme.colors.textMuted};
  letter-spacing: 0.06em;
`;

const FooterLinks = styled.div`
  display: flex;
  gap: 1.5rem;
`;

const FooterLink = styled.a`
  font-size: 0.82rem;
  color: ${p => p.theme.colors.textMuted};
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const FooterCopy = styled.div`
  font-size: 0.8rem;
  color: ${p => p.theme.colors.textMuted};
`;

// ── Mesh Nodes Data ───────────────────────────────────────────────────────────

const NODES = [
  { x: 22, y: 18, color: undefined },
  { x: 68, y: 12, color: '#10b981' },
  { x: 80, y: 55, color: '#8b5cf6' },
  { x: 75, y: 82, color: undefined },
  { x: 28, y: 78, color: '#10b981' },
  { x: 15, y: 52, color: '#8b5cf6' },
  { x: 50, y: 8,  color: undefined },
  { x: 50, y: 90, color: '#10b981' },
];

// Wireframe lines
const LINES: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,6],[6,1],[5,7],[7,3]
];

// ── Component ─────────────────────────────────────────────────────────────────

const DESIGNS = [
  { id: 1, name: 'Obsidian' },
  { id: 2, name: 'Neon Circuit' },
  { id: 5, name: 'Emerald Core' },
  { id: 6, name: 'Crystalline' },
  { id: 7, name: 'Plasma' },
  { id: 11, name: 'Titanium' },
  { id: 13, name: 'BioGlow' },
  { id: 16, name: 'CyberHex' },
  { id: 19, name: 'Ember' },
];

const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [stylesOpen, setStylesOpen] = useState(false);
  const stylesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (stylesRef.current && !stylesRef.current.contains(e.target as Node)) {
        setStylesOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleStartFree = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  const handleGuest = () => navigate('/dashboard');

  return (
    <Page>
      {/* ── Navbar ── */}
      <Nav>
        <Brand to="/">
          <BrandIcon>⬡</BrandIcon>
          GENSHAPE3D
        </Brand>
        <NavLinks>
          <NavLink to="#features">Features</NavLink>
          <NavLink to="#how">How it works</NavLink>
          <NavLink to="#pricing">Pricing</NavLink>
          <StylesDropdownWrapper ref={stylesRef}>
            <StylesBtn onClick={() => setStylesOpen(o => !o)}>
              Styles {stylesOpen ? '▲' : '▼'}
            </StylesBtn>
            <DropdownMenu open={stylesOpen}>
              <DropdownLabel>Design explorations</DropdownLabel>
              {DESIGNS.map(d => (
                <DropdownItem
                  key={d.id}
                  href={`/designs/design-${String(d.id).padStart(2, '0')}.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setStylesOpen(false)}
                >
                  {String(d.id).padStart(2, '0')} — {d.name}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </StylesDropdownWrapper>
        </NavLinks>
        <NavActions>
          <BtnOutline to="/login">Sign in</BtnOutline>
          <BtnPrimary to="/login">Get started</BtnPrimary>
        </NavActions>
      </Nav>

      {/* ── Hero ── */}
      <Hero>
        <GridPattern />
        <BgGlow $x={-10} $y={10} $color="#7c3aed" $size={600} />
        <BgGlow $x={70} $y={60} $color="#8b5cf6" $size={500} />
        <BgGlow $x={50} $y={-10} $color="#10b981" $size={400} />

        <HeroGrid>
          <HeroLeft>
            <HeroBadge>
              <BadgeDot /> AI-Powered 3D Generation
            </HeroBadge>
            <HeroTitle>
              Forge stunning<br />
              <GradientText>3D meshes</GradientText><br />
              from imagination
            </HeroTitle>
            <HeroSubtitle>
              GenShape3D transforms your text or image prompts into fully detailed,
              export-ready 3D meshes in seconds. Sculpt, refine, and deploy — no
              modelling experience required.
            </HeroSubtitle>
            <HeroCTAs>
              <CTAPrimary onClick={handleStartFree}>
                ⚡ Start generating free
              </CTAPrimary>
              <CTASecondary onClick={handleGuest}>
                👁 Preview as guest
              </CTASecondary>
            </HeroCTAs>
            <HeroStats>
              <Stat>
                <StatNum>50K+</StatNum>
                <StatLabel>Meshes generated</StatLabel>
              </Stat>
              <Stat>
                <StatNum>12K+</StatNum>
                <StatLabel>Active creators</StatLabel>
              </Stat>
              <Stat>
                <StatNum>&lt;30s</StatNum>
                <StatLabel>Avg. generation time</StatLabel>
              </Stat>
            </HeroStats>
          </HeroLeft>

          <HeroRight>
            <MeshContainer>
              <MeshOrb />
              <MeshRing $size={380} />
              <MeshRingInner $size={300} $delay={-2} />
              <MeshRing $size={220} $delay={-4} $color="#10b981" />
              <ScanLine />

              {/* SVG wireframe */}
              <MeshCanvas viewBox="0 0 480 480">
                {LINES.map(([a, b], i) => (
                  <line
                    key={i}
                    x1={NODES[a].x * 4.8}
                    y1={NODES[a].y * 4.8}
                    x2={NODES[b].x * 4.8}
                    y2={NODES[b].y * 4.8}
                    stroke={NODES[a].color || '#7c3aed'}
                    strokeWidth="0.8"
                  />
                ))}
              </MeshCanvas>

              {NODES.map((n, i) => (
                <MeshNode key={i} $x={n.x} $y={n.y} $color={n.color} />
              ))}

              <FloatCard1>
                <CardLabel>Status</CardLabel>
                <CardValue><GreenDot /> Generating mesh...</CardValue>
              </FloatCard1>

              <FloatCard2>
                <CardLabel>Resolution</CardLabel>
                <CardValue><VioletDot /> 4K — 287k polys</CardValue>
              </FloatCard2>
            </MeshContainer>
          </HeroRight>
        </HeroGrid>
      </Hero>

      {/* ── Features ── */}
      <Section id="features" $alt>
        <Container>
          <SectionHead>
            <SectionLabel>Capabilities</SectionLabel>
            <SectionTitle>Everything you need to<br />create stunning 3D</SectionTitle>
            <SectionDesc>
              From a simple text prompt to a print-ready or game-ready asset,
              GenShape3D handles the full pipeline with AI precision.
            </SectionDesc>
          </SectionHead>
          <FeatGrid>
            {[
              {
                icon: '✦', title: 'Text-to-3D', accent: '#7c3aed',
                desc: 'Describe any object in natural language and watch it materialise into a fully-detailed 3D mesh within seconds.',
              },
              {
                icon: '⬡', title: 'Image-to-3D', accent: '#8b5cf6',
                desc: 'Upload a reference photo or concept art and let GenShape3D reconstruct the exact geometry and surface details.',
              },
              {
                icon: '◈', title: 'Smart Topology', accent: '#10b981',
                desc: 'AI-optimised polygon distribution keeps your mesh game-ready or print-ready without manual retopology.',
              },
              {
                icon: '◇', title: 'PBR Textures', accent: '#7c3aed',
                desc: 'Auto-generated physically based rendering maps: diffuse, normal, roughness, metalness and ambient occlusion.',
              },
              {
                icon: '⬟', title: 'Multi-format Export', accent: '#8b5cf6',
                desc: 'Download in GLB, OBJ, FBX, USDZ and STL — ready for Unity, Unreal, Blender, or your 3D printer.',
              },
              {
                icon: '◉', title: 'Mesh Sculptor', accent: '#10b981',
                desc: 'Fine-tune the generated geometry in our browser-based sculpting view before exporting.',
              },
            ].map(f => (
              <FeatCard key={f.title} $accent={f.accent}>
                <FeatIcon $accent={f.accent}>{f.icon}</FeatIcon>
                <FeatTitle>{f.title}</FeatTitle>
                <FeatDesc>{f.desc}</FeatDesc>
              </FeatCard>
            ))}
          </FeatGrid>
        </Container>
      </Section>

      {/* ── How it works ── */}
      <Section id="how">
        <Container>
          <SectionHead>
            <SectionLabel>Workflow</SectionLabel>
            <SectionTitle>Three steps to your mesh</SectionTitle>
          </SectionHead>
          <StepsGrid>
            {[
              { n: '01', title: 'Describe or upload', desc: 'Type a text prompt or drop an image. Be as detailed or abstract as you like — our models understand context.' },
              { n: '02', title: 'Configure & generate', desc: 'Choose polygon budget, detail level, texture resolution and style. Hit Forge and the AI gets to work.' },
              { n: '03', title: 'Refine & export', desc: 'Preview in 3D, sculpt tweaks in-browser, then download in the format your pipeline needs.' },
            ].map(s => (
              <Step key={s.n}>
                <StepNum>{s.n}</StepNum>
                <StepTitle>{s.title}</StepTitle>
                <StepDesc>{s.desc}</StepDesc>
              </Step>
            ))}
          </StepsGrid>
        </Container>
      </Section>

      {/* ── Gallery preview ── */}
      <Section $alt>
        <Container>
          <SectionHead>
            <SectionLabel>Community Showcase</SectionLabel>
            <SectionTitle>What creators are forging</SectionTitle>
          </SectionHead>
          <GalleryGrid>
            {[
              { emoji: '🏺', label: 'Ancient vase — ceramic', color1: '#7c3aed', color2: '#8b5cf6', accent: '#7c3aed' },
              { emoji: '🚀', label: 'Sci-fi rocket — game asset', color1: '#10b981', color2: '#06b6d4', accent: '#10b981' },
              { emoji: '🐲', label: 'Dragon bust — high detail', color1: '#8b5cf6', color2: '#7c3aed', accent: '#8b5cf6' },
              { emoji: '🏔', label: 'Terrain chunk — landscape', color1: '#6b7280', color2: '#4b5563', accent: '#6b7280' },
              { emoji: '⚙', label: 'Gear mechanism — mech', color1: '#10b981', color2: '#7c3aed', accent: '#10b981' },
              { emoji: '💎', label: 'Crystal formation — PBR', color1: '#8b5cf6', color2: '#10b981', accent: '#8b5cf6' },
              { emoji: '🎭', label: 'Character mask — stylised', color1: '#7c3aed', color2: '#6b7280', accent: '#7c3aed' },
              { emoji: '🌿', label: 'Organic plant — botanical', color1: '#10b981', color2: '#6b7280', accent: '#10b981' },
            ].map(g => (
              <GalleryItem key={g.label} $accent={g.accent}>
                <GalleryItemInner $color1={g.color1} $color2={g.color2}>
                  {g.emoji}
                </GalleryItemInner>
                <GalleryLabel>{g.label}</GalleryLabel>
              </GalleryItem>
            ))}
          </GalleryGrid>
        </Container>
      </Section>

      {/* ── Pricing ── */}
      <Section id="pricing">
        <Container>
          <SectionHead>
            <SectionLabel>Pricing</SectionLabel>
            <SectionTitle>Start free, scale as you create</SectionTitle>
            <SectionDesc>
              Every plan gives access to the GenShape3D portal.
              Upgrade anytime to unlock more generation credits and advanced features.
            </SectionDesc>
          </SectionHead>
          <PricingGrid>
            {/* Guest */}
            <PricingCard>
              <PricingTier>Guest</PricingTier>
              <PricingPrice>Free</PricingPrice>
              <PricingPer>No account needed</PricingPer>
              <PricingFeatures>
                <PricingFeature><CheckIcon>✓</CheckIcon> Browse the gallery</PricingFeature>
                <PricingFeature><CheckIcon>✓</CheckIcon> View community meshes</PricingFeature>
                <PricingFeature><CheckIcon>✓</CheckIcon> Explore features</PricingFeature>
                <PricingFeature $disabled><XIcon>✕</XIcon> Generate meshes</PricingFeature>
                <PricingFeature $disabled><XIcon>✕</XIcon> Download assets</PricingFeature>
                <PricingFeature $disabled><XIcon>✕</XIcon> Save projects</PricingFeature>
              </PricingFeatures>
              <PricingCTA onClick={handleGuest}>Continue as guest</PricingCTA>
            </PricingCard>

            {/* Free */}
            <PricingCard $featured>
              <PricingBadge>Most Popular</PricingBadge>
              <PricingTier>Free Account</PricingTier>
              <PricingPrice>$<sup>0</sup>0</PricingPrice>
              <PricingPer>Always free — limited credits</PricingPer>
              <PricingFeatures>
                <PricingFeature><CheckIcon>✓</CheckIcon> Everything in Guest</PricingFeature>
                <PricingFeature><CheckIcon $color="#10b981">✓</CheckIcon> Generate meshes (limited)</PricingFeature>
                <PricingFeature><CheckIcon $color="#10b981">✓</CheckIcon> Download GLB & OBJ</PricingFeature>
                <PricingFeature><CheckIcon $color="#10b981">✓</CheckIcon> Save up to 10 projects</PricingFeature>
                <PricingFeature $disabled><XIcon>✕</XIcon> Priority queue</PricingFeature>
                <PricingFeature $disabled><XIcon>✕</XIcon> 4K texture export</PricingFeature>
              </PricingFeatures>
              <PricingCTA $featured onClick={handleStartFree}>Get started free</PricingCTA>
            </PricingCard>

            {/* Pro */}
            <PricingCard>
              <PricingTier>Pro</PricingTier>
              <PricingPrice><sup>$</sup>29</PricingPrice>
              <PricingPer>per month — billed monthly</PricingPer>
              <PricingFeatures>
                <PricingFeature><CheckIcon>✓</CheckIcon> Everything in Free</PricingFeature>
                <PricingFeature><CheckIcon $color="#8b5cf6">✓</CheckIcon> Unlimited generations</PricingFeature>
                <PricingFeature><CheckIcon $color="#8b5cf6">✓</CheckIcon> 4K PBR textures</PricingFeature>
                <PricingFeature><CheckIcon $color="#8b5cf6">✓</CheckIcon> Priority GPU queue</PricingFeature>
                <PricingFeature><CheckIcon $color="#8b5cf6">✓</CheckIcon> All export formats</PricingFeature>
                <PricingFeature><CheckIcon $color="#8b5cf6">✓</CheckIcon> API access</PricingFeature>
              </PricingFeatures>
              <PricingCTA onClick={handleStartFree}>Upgrade to Pro</PricingCTA>
            </PricingCard>
          </PricingGrid>
        </Container>
      </Section>

      {/* ── Footer ── */}
      <Footer>
        <FooterInner>
          <FooterBrand>GENSHAPE3D</FooterBrand>
          <FooterLinks>
            <FooterLink href="#">Docs</FooterLink>
            <FooterLink href="#">API</FooterLink>
            <FooterLink href="#">Status</FooterLink>
            <FooterLink href="#">Privacy</FooterLink>
            <FooterLink href="#">Terms</FooterLink>
          </FooterLinks>
          <FooterCopy>© 2026 GenShape3D. All rights reserved.</FooterCopy>
        </FooterInner>
      </Footer>
    </Page>
  );
};

export default Landing;
