import React from 'react';
import { Auth0Provider } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';

const Auth0ProviderWithNavigate: React.FC<React.PropsWithChildren> = ({ children }) => {
  const navigate = useNavigate();

  const domain = import.meta.env.VITE_AUTH0_DOMAIN as string;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;
  const redirectUri = (import.meta.env.VITE_AUTH0_REDIRECT_URI as string) || window.location.origin;

  // Always mount Auth0Provider — use placeholders if not configured so
  // useAuth0() never throws. With a fake domain Auth0 will fail to auth
  // and settle on isLoading=false / isAuthenticated=false (guest mode).
  const safeDomain = domain || 'placeholder.auth0.com';
  const safeClientId = clientId || 'placeholder-client-id';

  const onRedirectCallback = (appState?: { returnTo?: string }) => {
    navigate(appState?.returnTo || '/dashboard', { replace: true });
  };

  return (
    <Auth0Provider
      domain={safeDomain}
      clientId={safeClientId}
      authorizationParams={{ redirect_uri: redirectUri, audience }}
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
};

export default Auth0ProviderWithNavigate;
