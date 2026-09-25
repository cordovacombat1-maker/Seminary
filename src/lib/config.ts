export interface PublicConfig {
  database: boolean; // Netlify Database is ready
  ai: boolean; // Netlify AI Gateway is switched on
  hasAccounts: boolean; // someone has signed up (the first account becomes the administrator)
  textsLoaded: boolean; // the Bible texts have been loaded from the Admin page
}

let config: PublicConfig | null = null;

/** Fetch the site's readiness from /api/config (once). */
export async function loadConfig(): Promise<PublicConfig> {
  if (config) return config;
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Could not load site settings.');
  config = (await res.json()) as PublicConfig;
  return config;
}

// The login token lives in this browser only. Storage can be unavailable (private mode), so
// every access is guarded and the app still works for the current visit.
const TOKEN_KEY = 'seminary-token';
let memoryToken: string | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}
