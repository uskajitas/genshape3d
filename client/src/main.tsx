import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createGlobalStyle } from 'styled-components';
import App from './App';
import { ThemeContext, ThemeMode } from './context/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Brand palette — purple + pink (token names preserved for existing components)
//   primary       → vibrant purple (primary actions, brand hue)
//   primaryLight  → soft purple (hover / muted brand uses)
//   violet        → magenta-pink (paired with `primary` to form gradients →
//                   `linear-gradient(primary, violet)` reads purple→pink)
//   green         → kept for "live" / success status dots only
//   surfaces      → warm-violet near-blacks for the dark mode
// ─────────────────────────────────────────────────────────────────────────────

// Neutral dark greys (Meshy / Tripo3D style) with purple+pink reserved as
// brand accents only — never as page chrome.

export const darkTheme = {
  colors: {
    primary: '#A855F7',
    primaryLight: '#C084FC',
    green: '#10B981',
    violet: '#EC4899',
    grey: '#6B7280',
    background: '#101013',
    surface: '#1A1A1F',
    surfaceHigh: '#26262C',
    text: '#F4F4F6',
    textMuted: '#A4A4AC',
    border: '#2E2E34',
    borderHigh: '#42424A',
  },
};

export const lightTheme = {
  colors: {
    primary: '#A855F7',
    primaryLight: '#C084FC',
    green: '#059669',
    violet: '#EC4899',
    grey: '#6B7280',
    background: '#FAFAFB',
    surface: '#FFFFFF',
    surfaceHigh: '#F4F4F6',
    text: '#0F0F11',
    textMuted: '#5C5C63',
    border: '#E4E4E8',
    borderHigh: '#CECED3',
  },
};

const GlobalStyle = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: ${(p: any) => p.theme?.colors?.background ?? '#07060f'};
    color: ${(p: any) => p.theme?.colors?.text ?? '#f0eefa'};
    transition: background 0.2s, color 0.2s;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  a { color: inherit; text-decoration: none; }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: #0A0A0B; }
  ::-webkit-scrollbar-thumb { background: #3A3A3F; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #5A5A60; }
  * { scrollbar-width: thin; scrollbar-color: #3A3A3F #0A0A0B; }
`;

function Root() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('gs3d-theme') as ThemeMode) || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('gs3d-theme', mode);
  }, [mode]);

  const toggle = () => setMode(m => (m === 'dark' ? 'light' : 'dark'));
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <App />
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
