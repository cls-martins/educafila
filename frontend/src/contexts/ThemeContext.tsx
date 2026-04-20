import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', toggle: () => {}, setTheme: () => {} });

const STORAGE_KEY = 'educafila-theme';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, profile } = useAuth();
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Theme | null;
    return stored === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => { applyTheme(theme); }, [theme]);

  // When the profile loads from Supabase, adopt its preference (first time).
  useEffect(() => {
    const pref = (profile as any)?.theme as Theme | undefined;
    if (pref && pref !== theme) {
      setThemeState(pref);
      localStorage.setItem(STORAGE_KEY, pref);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id]);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      localStorage.setItem(STORAGE_KEY, t);
      if (user?.id) {
        supabase.from('profiles').update({ theme: t }).eq('user_id', user.id).then(() => {});
      }
    },
    [user?.id],
  );

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return <Ctx.Provider value={{ theme, toggle, setTheme }}>{children}</Ctx.Provider>;
};

export const useTheme = () => useContext(Ctx);
