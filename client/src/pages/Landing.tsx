// ─────────────────────────────────────────────────────────────────────────────
// Landing — public marketing page.
//
// Same visual language as the Workspace (neutral dark greys, purple+pink
// accents, subtle radial gradients) but laid out as a scrolling marketing
// page: top nav → hero → how it works → pricing → footer.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Animations
// ─────────────────────────────────────────────────────────────────────────────

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const float = keyframes`
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50%      { transform: translateY(-14px) rotate(2deg); }
`;

const rotate = keyframes`
  from { transform: rotate(0deg); } to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.06); }
`;

const sweep = keyframes`
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Page scaffold
// ─────────────────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background:
    radial-gradient(ellipse 70% 60% at 50% 0%, ${p => p.theme.colors.primary}1c, transparent 60%),
    radial-gradient(ellipse 50% 50% at 90% 30%, ${p => p.theme.colors.violet}14, transparent 60%),
    radial-gradient(ellipse 50% 50% at 10% 70%, ${p => p.theme.colors.primary}0e, transparent 60%),
    ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.text};
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Top nav (re-uses the Workspace look)
// ─────────────────────────────────────────────────────────────────────────────

const NavBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 2rem;
  height: 64px;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background:
    linear-gradient(180deg, ${p => p.theme.colors.surfaceHigh}cc, ${p => p.theme.colors.surface}cc);
  backdrop-filter: blur(14px);
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
`;

const BrandMark = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  display: flex; align-items: center; justify-content: center;
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

const NavTabLink = styled.a`
  background: none;
  border: 0;
  cursor: pointer;
  padding: 0.4rem 0.75rem;
  border-radius: 7px;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  &:hover { color: ${p => p.theme.colors.text}; background: ${p => p.theme.colors.surfaceHigh}; }
`;

const NavSpacer = styled.div`flex: 1;`;

const SignInBtn = styled(Link)`
  padding: 0.42rem 1rem;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: transparent;
  color: ${p => p.theme.colors.text};
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  &:hover { background: ${p => p.theme.colors.surfaceHigh}; border-color: ${p => p.theme.colors.violet}; }
`;

const PrimaryNavBtn = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 1rem;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 14px ${p => p.theme.colors.primary}55;
  &:hover { box-shadow: 0 4px 22px ${p => p.theme.colors.violet}88; }
  &::after {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%);
    animation: ${sweep} 2.6s linear infinite;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────

const Hero = styled.section`
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: 3rem;
  padding: 6rem 2rem 5rem;
  max-width: 1200px;
  margin: 0 auto;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    text-align: center;
    padding: 4rem 1.5rem 3rem;
  }
`;

const HeroLeft = styled.div`
  animation: ${fadeUp} 0.6s ease both;
`;

const HeroBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.32rem 0.85rem;
  border-radius: 999px;
  border: 1px solid ${p => p.theme.colors.primary}55;
  background: ${p => p.theme.colors.primary}1f;
  color: ${p => p.theme.colors.primaryLight};
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-bottom: 1.4rem;
`;

const BadgeDot = styled.span`
  width: 6px; height: 6px;
  border-radius: 50%;
  background: ${p => p.theme.colors.green};
  animation: ${pulse} 2s ease infinite;
`;

const HeroTitle = styled.h1`
  font-family: 'Space Grotesk', 'Inter', sans-serif;
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0 0 1.25rem;
  color: ${p => p.theme.colors.text};
`;

const HeroAccent = styled.span`
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const HeroSub = styled.p`
  font-size: 1.05rem;
  line-height: 1.6;
  color: ${p => p.theme.colors.textMuted};
  max-width: 480px;
  margin: 0 0 2rem;
  @media (max-width: 900px) { margin-left: auto; margin-right: auto; }
`;

const CtaRow = styled.div`
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
  @media (max-width: 900px) { justify-content: center; }
`;

const CtaPrimary = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1.6rem;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 6px 22px ${p => p.theme.colors.primary}66;
  transition: transform 0.12s, box-shadow 0.12s;
  &:hover { transform: translateY(-1px); box-shadow: 0 8px 30px ${p => p.theme.colors.violet}99; }
`;

const CtaSecondary = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.85rem 1.6rem;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  background: ${p => p.theme.colors.surface};
  color: ${p => p.theme.colors.text};
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  &:hover { border-color: ${p => p.theme.colors.violet}; background: ${p => p.theme.colors.surfaceHigh}; }
`;

const HeroStats = styled.div`
  display: flex;
  gap: 2rem;
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid ${p => p.theme.colors.border};
  @media (max-width: 900px) { justify-content: center; flex-wrap: wrap; }
`;

const Stat = styled.div``;
const StatNum = styled.div`
  font-family: 'Space Grotesk', 'Inter', sans-serif;
  font-size: 1.5rem;
  font-weight: 800;
  color: ${p => p.theme.colors.text};
`;
const StatLabel = styled.div`
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
`;

// ── Hero illustration ───────────────────────────────────────────────────────

const HeroRight = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ${fadeUp} 0.8s ease 0.15s both;
  @media (max-width: 900px) { display: none; }
`;

const OrbStage = styled.div`
  position: relative;
  width: 420px; height: 420px;
`;

const OrbCore = styled.div`
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 180px; height: 180px;
  border-radius: 30%;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  box-shadow:
    0 20px 60px ${p => p.theme.colors.primary}88,
    inset 0 -20px 60px ${p => p.theme.colors.violet}99;
  animation: ${float} 6s ease-in-out infinite;
`;

const OrbRing = styled.div<{ $size: number; $delay?: number; $color?: string }>`
  position: absolute;
  top: 50%; left: 50%;
  width: ${p => p.$size}px;
  height: ${p => p.$size}px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px dashed ${p => p.$color || p.theme.colors.violet}66;
  animation: ${rotate} ${p => 14 + p.$size / 30}s linear infinite ${p => p.$delay ? `${p.$delay}s` : ''};
`;

const OrbDot = styled.div<{ $top: number; $left: number; $color?: string }>`
  position: absolute;
  top: ${p => p.$top}%;
  left: ${p => p.$left}%;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: ${p => p.$color || p.theme.colors.primary};
  box-shadow: 0 0 14px ${p => p.$color || p.theme.colors.primary};
  animation: ${pulse} 2.4s ease infinite;
`;

// Floating glass cards over the orb
const GlassCard = styled.div`
  position: absolute;
  background: ${p => p.theme.colors.surface}f2;
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 12px;
  padding: 0.65rem 0.9rem;
  font-size: 0.78rem;
  backdrop-filter: blur(10px);
  box-shadow: 0 14px 40px rgba(0,0,0,0.4);
`;

const Card1 = styled(GlassCard)`
  top: 14%; left: -4%;
  animation: ${float} 6s ease-in-out infinite;
`;

const Card2 = styled(GlassCard)`
  bottom: 16%; right: -2%;
  animation: ${float} 7s ease-in-out 1.5s infinite;
`;

const CardLabel = styled.div`
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.7rem;
  margin-bottom: 0.2rem;
`;

const CardValue = styled.div`
  color: ${p => p.theme.colors.text};
  font-weight: 700;
  display: flex; align-items: center; gap: 0.4rem;
`;

const StatusDot = styled.span<{ $color?: string }>`
  width: 6px; height: 6px;
  border-radius: 50%;
  background: ${p => p.$color || p.theme.colors.green};
  display: inline-block;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Section scaffold
// ─────────────────────────────────────────────────────────────────────────────

const Section = styled.section<{ $alt?: boolean }>`
  padding: 5rem 2rem;
  background: ${p => p.$alt
    ? `linear-gradient(180deg, ${p.theme.colors.surface}aa, transparent)`
    : 'transparent'};
`;

const Container = styled.div`
  max-width: 1100px;
  margin: 0 auto;
`;

const SectionLabel = styled.div`
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.primaryLight};
  margin-bottom: 0.65rem;
`;

const SectionTitle = styled.h2`
  font-family: 'Space Grotesk', 'Inter', sans-serif;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 0.85rem;
  color: ${p => p.theme.colors.text};
`;

const SectionDesc = styled.p`
  font-size: 1rem;
  line-height: 1.6;
  color: ${p => p.theme.colors.textMuted};
  max-width: 560px;
  margin: 0;
`;

const SectionHead = styled.div`margin-bottom: 3rem;`;

// ─────────────────────────────────────────────────────────────────────────────
// How it works
// ─────────────────────────────────────────────────────────────────────────────

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const Step = styled.div`
  background:
    linear-gradient(180deg, ${p => p.theme.colors.surfaceHigh}, ${p => p.theme.colors.surface});
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 16px;
  padding: 2rem 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const StepNum = styled.div`
  font-family: 'Space Grotesk', monospace;
  font-size: 1.6rem;
  font-weight: 800;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const StepTitle = styled.div`
  font-weight: 700;
  font-size: 1rem;
  color: ${p => p.theme.colors.text};
`;

const StepDesc = styled.div`
  font-size: 0.88rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.55;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Pricing
// ─────────────────────────────────────────────────────────────────────────────

const PriceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    max-width: 420px;
    margin: 0 auto;
  }
`;

const PriceCard = styled.div<{ $featured?: boolean }>`
  position: relative;
  background: ${p => p.$featured
    ? `linear-gradient(180deg, ${p.theme.colors.surfaceHigh}, ${p.theme.colors.surface})`
    : `linear-gradient(180deg, ${p.theme.colors.surface}, ${p.theme.colors.background})`};
  border: 1px solid ${p => p.$featured ? p.theme.colors.primary + '99' : p.theme.colors.border};
  border-radius: 18px;
  padding: 2rem 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  ${p => p.$featured && `
    box-shadow: 0 12px 50px ${p.theme.colors.primary}33;
    transform: translateY(-6px);
  `}
`;

const PriceBadge = styled.div`
  position: absolute;
  top: 0; left: 50%;
  transform: translate(-50%, -50%);
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  color: white;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  box-shadow: 0 4px 18px ${p => p.theme.colors.primary}66;
`;

const PriceTier = styled.div`
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${p => p.theme.colors.textMuted};
`;

const PriceAmount = styled.div`
  font-family: 'Space Grotesk', 'Inter', sans-serif;
  font-size: 2.6rem;
  font-weight: 800;
  color: ${p => p.theme.colors.text};
  letter-spacing: -0.02em;
  display: flex; align-items: flex-start; gap: 0.2rem;
  sup { font-size: 1.1rem; margin-top: 0.6rem; }
`;

const PriceUnit = styled.div`
  font-size: 0.82rem;
  color: ${p => p.theme.colors.textMuted};
`;

const PriceFeatures = styled.ul`
  list-style: none;
  display: flex; flex-direction: column;
  gap: 0.55rem;
  margin: 0.75rem 0 1.25rem;
  padding: 0;
`;

const PriceFeature = styled.li<{ $disabled?: boolean }>`
  display: flex; align-items: center; gap: 0.55rem;
  font-size: 0.86rem;
  color: ${p => p.$disabled ? p.theme.colors.textMuted : p.theme.colors.text};
  opacity: ${p => p.$disabled ? 0.5 : 1};
`;

const Check = styled.span<{ $color?: string }>`
  width: 18px; height: 18px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem;
  background: ${p => (p.$color || p.theme.colors.primary)}22;
  border: 1px solid ${p => (p.$color || p.theme.colors.primary)}55;
  color: ${p => p.$color || p.theme.colors.primaryLight};
  flex-shrink: 0;
`;

const Cross = styled(Check)`
  background: ${p => p.theme.colors.grey}1f;
  border-color: ${p => p.theme.colors.grey}33;
  color: ${p => p.theme.colors.grey};
`;

const PriceCTA = styled(Link)<{ $featured?: boolean }>`
  display: block;
  text-align: center;
  text-decoration: none;
  margin-top: auto;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 700;
  background: ${p => p.$featured
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$featured ? 'white' : p.theme.colors.text};
  border: 1px solid ${p => p.$featured ? 'transparent' : p.theme.colors.borderHigh};
  ${p => p.$featured && `box-shadow: 0 6px 22px ${p.theme.colors.primary}66;`}
  &:hover {
    ${p => !p.$featured && `
      background: ${p.theme.colors.surfaceHigh};
      border-color: ${p.theme.colors.violet};
    `}
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

const Footer = styled.footer`
  border-top: 1px solid ${p => p.theme.colors.border};
  padding: 2.5rem 2rem;
  background: ${p => p.theme.colors.surface};
`;

const FooterInner = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
`;

const FooterBrand = styled.div`
  font-weight: 800;
  letter-spacing: 0.04em;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.9rem;
`;

const FooterLinks = styled.div`
  display: flex;
  gap: 1.5rem;
`;

const FooterLink = styled.a`
  font-size: 0.82rem;
  color: ${p => p.theme.colors.textMuted};
  text-decoration: none;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const FooterCopy = styled.div`
  font-size: 0.78rem;
  color: ${p => p.theme.colors.textMuted};
`;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const Landing: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const goWorkspace = () => navigate(isAuthenticated ? '/dashboard' : '/login');

  return (
    <Page>
      <NavBar>
        <BrandWrap to="/">
          <BrandMark>⬡</BrandMark>
          GENSHAPE3D
        </BrandWrap>
        <NavTabs>
          <NavTabLink href="#how">How it works</NavTabLink>
          <NavTabLink href="#pricing">Pricing</NavTabLink>
        </NavTabs>
        <NavSpacer />
        {isAuthenticated ? (
          <PrimaryNavBtn to="/dashboard">✦ Open workspace</PrimaryNavBtn>
        ) : (
          <>
            <SignInBtn to="/login">Sign in</SignInBtn>
            <PrimaryNavBtn to="/login">✦ Start free</PrimaryNavBtn>
          </>
        )}
      </NavBar>

      {/* ─────── Hero ─────── */}
      <Hero>
        <HeroLeft>
          <HeroBadge>
            <BadgeDot /> Image to 3D · live now
          </HeroBadge>
          <HeroTitle>
            Turn any image into a<br />
            <HeroAccent>real 3D model</HeroAccent>
          </HeroTitle>
          <HeroSub>
            Upload a photo, sketch, or piece of concept art. GenShape3D reconstructs
            the geometry and gives you back a clean, export-ready mesh. No modelling
            experience required.
          </HeroSub>
          <CtaRow>
            <CtaPrimary to={isAuthenticated ? '/dashboard' : '/login'}>
              ✦ {isAuthenticated ? 'Open workspace' : 'Start free'}
            </CtaPrimary>
            <CtaSecondary to="#how">See how it works</CtaSecondary>
          </CtaRow>
          <HeroStats>
            <Stat>
              <StatNum>1</StatNum>
              <StatLabel>Free generation, no card</StatLabel>
            </Stat>
            <Stat>
              <StatNum>GLB</StatNum>
              <StatLabel>Standard export format</StatLabel>
            </Stat>
            <Stat>
              <StatNum>$3</StatNum>
              <StatLabel>10-pack starter price</StatLabel>
            </Stat>
          </HeroStats>
        </HeroLeft>

        <HeroRight>
          <OrbStage>
            <OrbRing $size={420} />
            <OrbRing $size={320} $delay={-3} $color="#EC4899" />
            <OrbRing $size={240} $delay={-5} />
            <OrbCore />
            <OrbDot $top={5} $left={48} />
            <OrbDot $top={50} $left={94} $color="#EC4899" />
            <OrbDot $top={94} $left={48} />
            <OrbDot $top={50} $left={4} $color="#EC4899" />

            <Card1>
              <CardLabel>Status</CardLabel>
              <CardValue><StatusDot /> Mesh ready</CardValue>
            </Card1>
            <Card2>
              <CardLabel>Output</CardLabel>
              <CardValue><StatusDot $color="#A855F7" /> GLB · 10k faces</CardValue>
            </Card2>
          </OrbStage>
        </HeroRight>
      </Hero>

      {/* ─────── How it works ─────── */}
      <Section id="how" $alt>
        <Container>
          <SectionHead>
            <SectionLabel>How it works</SectionLabel>
            <SectionTitle>Three steps to your mesh</SectionTitle>
            <SectionDesc>
              We're keeping it focused. One thing, done well — image in, 3D model out.
            </SectionDesc>
          </SectionHead>
          <StepsGrid>
            {[
              { n: '01', title: 'Upload an image', desc: 'A photo, sketch, or piece of concept art. Front-facing single objects work best.' },
              { n: '02', title: 'Generate', desc: 'Hit Generate and our GPU reconstructs the geometry. A few minutes per model.' },
              { n: '03', title: 'Preview & export', desc: 'Inspect in the browser, then download as a clean GLB ready for your 3D pipeline.' },
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

      {/* ─────── Pricing ─────── */}
      <Section id="pricing">
        <Container>
          <SectionHead>
            <SectionLabel>Pricing</SectionLabel>
            <SectionTitle>Try free, pay as you go</SectionTitle>
            <SectionDesc>
              Low launch prices while we grow. Buy a small pack and only spend
              credits when you generate. No subscription required.
            </SectionDesc>
          </SectionHead>

          <PriceGrid>
            {/* Free trial */}
            <PriceCard>
              <PriceTier>Free trial</PriceTier>
              <PriceAmount>$<sup>0</sup>0</PriceAmount>
              <PriceUnit>1 generation · no credit card</PriceUnit>
              <PriceFeatures>
                <PriceFeature><Check>✓</Check> 1 image-to-3D generation</PriceFeature>
                <PriceFeature><Check>✓</Check> GLB download</PriceFeature>
                <PriceFeature><Check>✓</Check> Browser preview</PriceFeature>
                <PriceFeature $disabled><Cross>✕</Cross> Priority queue</PriceFeature>
                <PriceFeature $disabled><Cross>✕</Cross> Commercial license</PriceFeature>
              </PriceFeatures>
              <PriceCTA to="/login">Start free</PriceCTA>
            </PriceCard>

            {/* Starter — featured */}
            <PriceCard $featured>
              <PriceBadge>Most popular</PriceBadge>
              <PriceTier>Starter pack</PriceTier>
              <PriceAmount><sup>$</sup>3</PriceAmount>
              <PriceUnit>10 generations · credits never expire</PriceUnit>
              <PriceFeatures>
                <PriceFeature><Check $color="#A855F7">✓</Check> 10 image-to-3D generations</PriceFeature>
                <PriceFeature><Check $color="#A855F7">✓</Check> GLB download</PriceFeature>
                <PriceFeature><Check $color="#A855F7">✓</Check> Standard queue</PriceFeature>
                <PriceFeature><Check $color="#A855F7">✓</Check> Personal-use license</PriceFeature>
                <PriceFeature $disabled><Cross>✕</Cross> Commercial license</PriceFeature>
              </PriceFeatures>
              <PriceCTA $featured to="/login">Buy starter pack</PriceCTA>
            </PriceCard>

            {/* Creator */}
            <PriceCard>
              <PriceTier>Creator pack</PriceTier>
              <PriceAmount><sup>$</sup>10</PriceAmount>
              <PriceUnit>40 generations · credits never expire</PriceUnit>
              <PriceFeatures>
                <PriceFeature><Check $color="#EC4899">✓</Check> 40 image-to-3D generations</PriceFeature>
                <PriceFeature><Check $color="#EC4899">✓</Check> GLB download</PriceFeature>
                <PriceFeature><Check $color="#EC4899">✓</Check> Priority queue</PriceFeature>
                <PriceFeature><Check $color="#EC4899">✓</Check> Commercial license</PriceFeature>
                <PriceFeature><Check $color="#EC4899">✓</Check> Early access to new features</PriceFeature>
              </PriceFeatures>
              <PriceCTA to="/login">Buy creator pack</PriceCTA>
            </PriceCard>
          </PriceGrid>
        </Container>
      </Section>

      {/* ─────── CTA strip ─────── */}
      <Section>
        <Container>
          <Step style={{ textAlign: 'center', alignItems: 'center', gap: '1rem', padding: '3rem 2rem' }}>
            <SectionTitle style={{ marginBottom: 0 }}>
              Ready to <HeroAccent>shape</HeroAccent> something?
            </SectionTitle>
            <SectionDesc style={{ textAlign: 'center' }}>
              Your first generation is on us — sign in with Google in 5 seconds.
            </SectionDesc>
            <CtaPrimary to={isAuthenticated ? '/dashboard' : '/login'} style={{ marginTop: '0.5rem' }}>
              ✦ {isAuthenticated ? 'Open workspace' : 'Start free'}
            </CtaPrimary>
          </Step>
        </Container>
      </Section>

      {/* ─────── Footer ─────── */}
      <Footer>
        <FooterInner>
          <FooterBrand>GENSHAPE3D</FooterBrand>
          <FooterLinks>
            <FooterLink href="#how">How</FooterLink>
            <FooterLink href="#pricing">Pricing</FooterLink>
            <FooterLink href="#">Privacy</FooterLink>
            <FooterLink href="#">Terms</FooterLink>
          </FooterLinks>
          <FooterCopy>© 2026 GenShape3D</FooterCopy>
        </FooterInner>
      </Footer>
    </Page>
  );
};

export default Landing;
