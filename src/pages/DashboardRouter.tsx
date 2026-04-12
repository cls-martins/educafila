import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const DashboardRouter = () => {
  const { roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (roles.includes('super_admin')) return <Navigate to="/admin" replace />;
  if (roles.includes('gestao')) return <Navigate to="/gestao" replace />;
  if (roles.includes('professor')) return <Navigate to="/professor" replace />;
  if (roles.includes('aluno')) return <Navigate to="/aluno" replace />;

  return <Navigate to="/login" replace />;
};

export default DashboardRouter;
