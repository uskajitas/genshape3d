import { auth } from './firebase';

// Attaches the signed-in user's Firebase ID token to every call to this app's
// own /api, so the server can verify who is asking (see server accessGate.ts).
// Import once, first thing in main.tsx.
const API_BASE = ((import.meta as any).env?.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || '';
const nativeFetch = window.fetch.bind(window);

function isOwnApi(url: URL): boolean {
  const sameOrigin = url.origin === window.location.origin;
  const apiOrigin = API_BASE && url.href.startsWith(API_BASE);
  return (sameOrigin && url.pathname.startsWith('/api')) || !!apiOrigin;
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.href);
  if (!isOwnApi(url)) return nativeFetch(input, init);

  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return nativeFetch(input, init);

  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (!headers.has('authorization')) headers.set('authorization', `Bearer ${await user.getIdToken()}`);
  return nativeFetch(input, { ...init, headers });
};
