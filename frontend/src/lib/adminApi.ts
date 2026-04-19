import { supabase } from '@/integrations/supabase/client';

const BACKEND_URL = (import.meta.env.REACT_APP_BACKEND_URL as string) || '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function postJson<T = any>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const msg = (json && (json.detail || json.message)) || text || `Erro ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return json as T;
}

export type StaffRole = 'professor' | 'gestao';

export async function adminCreateStaff(payload: {
  full_name: string;
  email: string;
  school_id: string;
  role: StaffRole;
}) {
  return postJson<{ user_id: string; password: string; email: string }>(
    '/api/admin/staff',
    payload,
  );
}

export async function adminCreateStudent(payload: {
  full_name: string;
  email: string;
  school_id: string;
  classroom_id: string;
  gender?: string | null;
  year?: number | null;
}) {
  return postJson<{ user_id: string; password: string; email: string }>(
    '/api/admin/student',
    payload,
  );
}

export async function adminBulkStudents(payload: {
  school_id: string;
  classroom_id: string;
  year?: number | null;
  students: Array<{ full_name: string; email: string; gender?: string | null }>;
}) {
  return postJson<{
    success: Array<{ email: string; password: string }>;
    errors: Array<{ row: number; email?: string; reason: string }>;
  }>('/api/admin/students/bulk', payload);
}
