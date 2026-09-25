import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { db, loadConfig, type PublicConfig } from './config';

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

interface AuthState {
  ready: boolean;
  config: PublicConfig | null;
  configError: string | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  passwordRecovery: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const refreshProfile = useCallback(async () => {
    const { data } = await db().auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    const res = await db().from('profiles').select('id, email, full_name').eq('id', uid).maybeSingle();
    setProfile((res.data as Profile) ?? { id: uid, email: data.session?.user.email ?? '', full_name: '' });
    try {
      const me = await api<{ isAdmin: boolean }>('/api/me');
      setIsAdmin(me.isAdmin);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    loadConfig()
      .then(async (cfg) => {
        setConfig(cfg);
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          setReady(true);
          return;
        }
        const { data } = await db().auth.getSession();
        setSession(data.session);
        if (data.session) await refreshProfile();
        const sub = db().auth.onAuthStateChange((event, s) => {
          setSession(s);
          if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void refreshProfile();
          if (event === 'SIGNED_OUT') {
            setProfile(null);
            setIsAdmin(false);
          }
        });
        unsub = () => sub.data.subscription.unsubscribe();
        setReady(true);
      })
      .catch((e: Error) => {
        setConfigError(e.message);
        setReady(true);
      });
    return () => unsub?.();
  }, [refreshProfile]);

  return (
    <Ctx.Provider value={{ ready, config, configError, session, profile, isAdmin, refreshProfile, passwordRecovery }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
