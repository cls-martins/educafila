import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'aluno' | 'professor' | 'gestao' | 'super_admin';

type UserProfile = {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  school_id: string | null;
  classroom_id: string | null;
  course_id: string | null;
  gender: string | null;
  year: number | null;
  avatar_url: string | null;
  is_active: boolean;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  roles: UserRole[];
  loading: boolean;
  activeSchoolId: string | null;
  setActiveSchoolId: (id: string) => void;
  signOut: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSchoolId, setActiveSchoolId] = useState<string | null>(null);
  const initialized = useRef(false);

  const fetchUserData = async (userId: string) => {
    try {
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as UserProfile);
        setActiveSchoolId(profileRes.data.school_id);
      } else {
        setProfile(null);
      }

      if (rolesRes.data) {
        setRoles(rolesRes.data.map((r) => r.role as UserRole));
      } else {
        setRoles([]);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setProfile(null);
      setRoles([]);
    }
  };

  // Loads session + profile + roles, then releases loading
  const hydrate = async (newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);
    if (newSession?.user) {
      await fetchUserData(newSession.user.id);
    } else {
      setProfile(null);
      setRoles([]);
      setActiveSchoolId(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 8000);

    // Set up listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Skip if this is the initial event and getSession already handled it
      if (!initialized.current) return;
      setLoading(true);
      // defer to avoid supabase re-entrant warnings
      setTimeout(() => { hydrate(newSession); }, 0);
    });

    // Then get initial session
    (async () => {
      try {
        const { data: { session: initial }, error } = await supabase.auth.getSession();
        clearTimeout(safetyTimeout);
        if (error) {
          await supabase.auth.signOut().catch(() => {});
          await hydrate(null);
        } else {
          await hydrate(initial);
        }
      } catch (e) {
        clearTimeout(safetyTimeout);
        await hydrate(null);
      } finally {
        initialized.current = true;
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setActiveSchoolId(null);
  };

  const hasRole = (role: UserRole) => roles.includes(role);

  return (
    <AuthContext.Provider value={{
      session, user, profile, roles, loading,
      activeSchoolId, setActiveSchoolId,
      signOut, hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
