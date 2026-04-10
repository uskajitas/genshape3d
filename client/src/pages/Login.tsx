import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle, signInWithEmail } from '../firebase';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.08); }
`;

const rotateSlow = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const scanLine = keyframes`
  0% { top: 0%; opacity: 0; }
  5% { opacity: 1; }
  95% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
`;

// ── Layout ────────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: ${p => p.theme.colors.background};
  @media (max-width: 860px) { grid-template-columns: 1fr; }
`;

// ── Left Panel ────────────────────────────────────────────────────────────────

const LeftPanel = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  overflow: hidden;
  background: ${p => p.theme.colors.surface};
  border-right: 1px solid ${p => p.theme.colors.border};
  @media (max-width: 860px) { display: none; }
`;

const LeftBg = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 20%, ${p => p.theme.colors.primary}22 0%, transparent 60%),
    radial-gradient(ellipse at 70% 80%, ${p => p.theme.colors.violet}18 0%, transparent 60%),
    radial-gradient(ellipse at 50% 50%, ${p => p.theme.colors.green}0f 0%, transparent 70%);
`;

const GridPat = styled.div`
  position: absolute; inset: 0;
  background-image:
    linear-gradient(${p => p.theme.colors.border}66 1px, transparent 1px),
    linear-gradient(90deg, ${p => p.theme.colors.border}66 1px, transparent 1px);
  background-size: 40px 40px;
  opacity: 0.25;
`;

const LeftScan = styled.div`
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, ${p => p.theme.colors.green}88, transparent);
  animation: ${scanLine} 5s ease-in-out infinite;
`;

const VisualsWrap = styled.div`
  position: relative;
  width: 340px; height: 340px;
  z-index: 2;
  display: flex; align-items: center; justify-content: center;
`;

const OrbBig = styled.div`
  position: absolute;
  width: 260px; height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%,
    ${p => p.theme.colors.violet}55,
    ${p => p.theme.colors.primary}33,
    transparent 65%
  );
  animation: ${pulse} 4s ease-in-out infinite;
`;

const Ring = styled.div<{ $size: number; $rev?: boolean }>`
  position: absolute;
  width: ${p => p.$size}px; height: ${p => p.$size}px;
  border-radius: 50%;
  border: 1px solid ${p => p.theme.colors.primary}44;
  animation: ${rotateSlow} ${p => 10 + p.$size / 30}s linear infinite ${p => p.$rev ? 'reverse' : ''};
`;

const RingDash = styled(Ring)`
  border-style: dashed;
  border-color: ${p => p.theme.colors.green}44;
`;

const HexCenter = styled.div`
  font-size: 4rem;
  z-index: 2;
  filter: drop-shadow(0 0 24px ${p => p.theme.colors.violet});
`;

const LeftTagline = styled.div`
  z-index: 2;
  margin-top: 3rem;
  text-align: center;
`;

const LeftTitle = styled.h2`
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  color: ${p => p.theme.colors.text};
  margin-bottom: 0.6rem;
  letter-spacing: -0.02em;
`;

const LeftSub = styled.p`
  font-size: 0.9rem;
  color: ${p => p.theme.colors.textMuted};
  max-width: 280px;
  line-height: 1.6;
  margin: 0 auto;
`;

const LeftStats = styled.div`
  z-index: 2;
  display: flex;
  gap: 2.5rem;
  margin-top: 2.5rem;
`;

const LStat = styled.div`
  text-align: center;
`;

const LStatNum = styled.div`
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.4rem;
  font-weight: 800;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const LStatLabel = styled.div`
  font-size: 0.72rem;
  color: ${p => p.theme.colors.textMuted};
  margin-top: 0.1rem;
`;

// ── Right Panel / Form ────────────────────────────────────────────────────────

const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2.5rem;
  animation: ${fadeIn} 0.5s ease both;
`;

const FormWrap = styled.div`
  width: 100%;
  max-width: 400px;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 2.5rem;
  transition: color 0.15s;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const FormBrand = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: 'Orbitron', monospace;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: ${p => p.theme.colors.text};
  margin-bottom: 2.5rem;
`;

const BrandIcon = styled.div`
  width: 28px; height: 28px;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem;
`;

const FormTitle = styled.h1`
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.8rem;
  font-weight: 800;
  color: ${p => p.theme.colors.text};
  letter-spacing: -0.02em;
  margin-bottom: 0.4rem;
`;

const FormSubtitle = styled.p`
  font-size: 0.9rem;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 2rem;
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.5rem 0;
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.78rem;
  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${p => p.theme.colors.border};
  }
`;

const SocialBtn = styled.button<{ $provider?: string }>`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.85rem;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 10px;
  color: ${p => p.theme.colors.text};
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 0.75rem;
  transition: all 0.15s;
  &:hover {
    border-color: ${p => p.theme.colors.borderHigh};
    background: ${p => p.theme.colors.surfaceHigh};
    transform: translateY(-1px);
  }
`;

const ProviderIcon = styled.span`
  font-size: 1.1rem;
`;

const EmailForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const Label = styled.label`
  font-size: 0.82rem;
  font-weight: 600;
  color: ${p => p.theme.colors.textMuted};
  margin-bottom: 0.25rem;
  display: block;
`;

const Input = styled.input`
  width: 100%;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.border};
  border-radius: 9px;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  color: ${p => p.theme.colors.text};
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  &::placeholder { color: ${p => p.theme.colors.textMuted}; }
  &:focus {
    border-color: ${p => p.theme.colors.primary};
    box-shadow: 0 0 0 3px ${p => p.theme.colors.primary}22;
  }
`;

const SubmitBtn = styled.button`
  width: 100%;
  padding: 0.85rem;
  background: linear-gradient(135deg, ${p => p.theme.colors.primary}, ${p => p.theme.colors.violet});
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  margin-top: 0.25rem;
  &:hover { filter: brightness(1.12); transform: translateY(-1px); }
`;

const FormFooter = styled.div`
  margin-top: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const GuestLink = styled.button`
  background: none; border: none;
  font-size: 0.85rem;
  color: ${p => p.theme.colors.textMuted};
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const TermsText = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.textMuted};
  line-height: 1.5;
  text-align: center;
  a { color: ${p => p.theme.colors.primary}; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

const Login: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, isLoading]);

  const handleGoogle = async () => {
    try { await signInWithGoogle(); navigate('/dashboard', { replace: true }); }
    catch (e: any) { setError(e.message); }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try { await signInWithEmail(email, password); navigate('/dashboard', { replace: true }); }
    catch (e: any) { setError(e.message); }
  };

  const handleGuest = () => navigate('/dashboard');

  return (
    <Page>
      {/* ── Left visual panel ── */}
      <LeftPanel>
        <LeftBg />
        <GridPat />
        <LeftScan />

        <VisualsWrap>
          <OrbBig />
          <Ring $size={310} />
          <RingDash $size={240} $rev />
          <Ring $size={170} />
          <HexCenter>⬡</HexCenter>
        </VisualsWrap>

        <LeftTagline>
          <LeftTitle>Forge in minutes.</LeftTitle>
          <LeftSub>
            Join thousands of creators turning ideas into
            stunning 3D meshes with AI.
          </LeftSub>
        </LeftTagline>

        <LeftStats>
          <LStat><LStatNum>50K+</LStatNum><LStatLabel>Meshes</LStatLabel></LStat>
          <LStat><LStatNum>12K+</LStatNum><LStatLabel>Creators</LStatLabel></LStat>
          <LStat><LStatNum>&lt;30s</LStatNum><LStatLabel>Gen time</LStatLabel></LStat>
        </LeftStats>
      </LeftPanel>

      {/* ── Right form panel ── */}
      <RightPanel>
        <FormWrap>
          <BackLink to="/">← Back to home</BackLink>

          <FormBrand>
            <BrandIcon>⬡</BrandIcon>
            GENSHAPE3D
          </FormBrand>

          <FormTitle>Welcome back</FormTitle>
          <FormSubtitle>Sign in to your account or create a new one</FormSubtitle>

          <SocialBtn onClick={handleGoogle}>
            <ProviderIcon>🌐</ProviderIcon>
            Continue with Google
          </SocialBtn>

          <Divider>or continue with email</Divider>

          <EmailForm onSubmit={handleEmail}>
            <div>
              <Label>Email address</Label>
              <Input type="email" placeholder="you@example.com" autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" placeholder="••••••••" autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            {error && <p style={{ color: '#f87171', fontSize: '0.82rem' }}>{error}</p>}
            <SubmitBtn type="submit">Sign in</SubmitBtn>
          </EmailForm>

          <FormFooter>
            <GuestLink onClick={handleGuest}>
              Continue as guest (view only)
            </GuestLink>
            <TermsText>
              By continuing you agree to our{' '}
              <a href="#">Terms of Service</a> and{' '}
              <a href="#">Privacy Policy</a>.
            </TermsText>
          </FormFooter>
        </FormWrap>
      </RightPanel>
    </Page>
  );
};

export default Login;
