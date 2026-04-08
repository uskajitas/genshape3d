import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createGlobalStyle } from 'styled-components';
import App from './App';
import Auth0ProviderWithNavigate from './providers/Auth0ProviderWithNavigate';
import { ThemeContext, ThemeMode } from './context/ThemeContext';

export const darkTheme = {
  colors: {
    primary: '#7c3aed',
    primaryLight: '#a78bfa',
    green: '#10b981',
    violet: '#8b5cf6',
    grey: '#6b7280',
    background: '#07060f',
    surface: '#0f0d1a',
    surfaceHigh: '#181530',
    text: '#f0eefa',
    textMuted: '#9d93b8',
    border: '#1e1b2e',
    borderHigh: '#2e2850',
  },
};

export const lightTheme = {
  colors: {
    primary: '#7c3aed',
    primaryLight: '#8b5cf6',
    green: '#059669',
    violet: '#7c3aed',
    grey: '#6b7280',
    background: '#ffffff',
    surface: '#f5f3ff',
    surfaceHigh: '#ede9fe',
    text: '#0f0a1e',
    textMuted: '#6b7280',
    border: '#e4deff',
    borderHigh: '#c4b5fd',
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
  ::-webkit-scrollbar-track { background: #07060f; }
  ::-webkit-scrollbar-thumb { background: #2e2850; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #4c3f8a; }
  * { scrollbar-width: thin; scrollbar-color: #2e2850 #07060f; }
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
      <Auth0ProviderWithNavigate>
        <Root />
      </Auth0ProviderWithNavigate>
    </BrowserRouter>
  </React.StrictMode>
);
