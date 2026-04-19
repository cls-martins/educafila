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
        supabase.from('profiles').select('*').eq('user_id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data as UserProfile);
        setActiveSchoolId(profileRes.data.school_id);
      }

      if (rolesRes.data) {
        setRoles(rolesRes.data.map((r) => r.role as UserRole));
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 5000);

    // Set up listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Skip if this is the initial event and getSession already handled it
      if (!initialized.current) return;
      
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setTimeout(() => fetchUserData(session.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
        setActiveSchoolId(null);
      }
      setLoading(false);
    });

    // Then get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      clearTimeout(safetyTimeout);
      if (error) {
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUser(null);
      } else {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) fetchUserData(session.user.id);
      }
      setLoading(false);
      // Mark as initialized so future onAuthStateChange events are processed
      initialized.current = true;
    });

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
