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

export const darkTheme = {
  colors: {
    primary: '#A855F7',
    primaryLight: '#C084FC',
    green: '#10B981',
    violet: '#EC4899',
    grey: '#6B7280',
    background: '#0B0712',
    surface: '#150D24',
    surfaceHigh: '#1E1432',
    text: '#F4EEFF',
    textMuted: '#A89CC4',
    border: '#2A1F3D',
    borderHigh: '#3D2C56',
  },
};

export const lightTheme = {
  colors: {
    primary: '#A855F7',
    primaryLight: '#C084FC',
    green: '#059669',
    violet: '#EC4899',
    grey: '#6B7280',
    background: '#FFFCFE',
    surface: '#FAF3FE',
    surfaceHigh: '#F1E4FB',
    text: '#1A0F2A',
    textMuted: '#6B5C82',
    border: '#EBDEF7',
    borderHigh: '#D6B8F1',
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
  ::-webkit-scrollbar-track { background: #0B0712; }
  ::-webkit-scrollbar-thumb { background: #3D2C56; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #6B4895; }
  * { scrollbar-width: thin; scrollbar-color: #3D2C56 #0B0712; }
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
