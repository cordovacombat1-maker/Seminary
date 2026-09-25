import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { getToken, loadConfig, setToken, type PublicConfig } from './config';

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

interface Session {
  user: { id: string; email: string };
}

interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
}

interface AuthState {
  ready: boolean;
  config: PublicConfig | null;
  configError: string | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!getToken()) return setMe(null);
    try {
      setMe(await api<MeResponse>('/api/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    loadConfig()
      .then(async (cfg) => {
        setConfig(cfg);
        if (cfg.database) await refreshProfile();
      })
      .catch((e: Error) => setConfigError(e.message))
      .finally(() => setReady(true));
  }, [refreshProfile]);

  const startSession = async (res: { token: string }) => {
    setToken(res.token);
    await refreshProfile();
  };

  const login = async (email: string, password: string) =>
    startSession(await api<{ token: string }>('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'login', email, password }) }));

  const signup = async (email: string, password: string, fullName: string) =>
    startSession(await api<{ token: string }>('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'signup', email, password, fullName }) }));

  const logout = async () => {
    await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).catch(() => undefined);
    setToken(null);
    setMe(null);
  };

  const session = me ? { user: { id: me.id, email: me.email } } : null;
  const profile = me ? { id: me.id, email: me.email, full_name: me.fullName } : null;
  return (
    <Ctx.Provider value={{ ready, config, configError, session, profile, isAdmin: !!me?.isAdmin, refreshProfile, login, signup, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
