import { supabase } from '@/integrations/supabase/client';

// All admin operations are now served by a single Supabase Edge Function
// named `admin-users` (see /app/supabase/functions/admin-users/index.ts).
// The function validates the caller's JWT and super_admin role server-side,
// then performs the privileged operation using the service_role key.

const FUNCTION_NAME = 'admin-users';

async function invokeAdmin<T = any>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action, ...payload },
  });
  if (error) {
    // In supabase-js v2, FunctionsHttpError.context IS the Response object.
    let detail = error.message || `Erro ao chamar ${action}`;
    try {
      const ctx: any = (error as any).context;
      // ctx can be a Response (FunctionsHttpError) or {response: Response}
      const res: Response | undefined = ctx instanceof Response ? ctx : ctx?.response;
      if (res && typeof res.clone === 'function') {
        const text = await res.clone().text();
        if (text) {
          try {
            const j = JSON.parse(text);
            detail = j.detail || j.message || j.error || text;
          } catch {
            detail = text;
          }
        }
      }
    } catch { /* ignore */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export type StaffRole = 'professor' | 'gestao';

export async function adminCreateStaff(payload: {
  full_name: string;
  email: string;
  school_id: string;
  role: StaffRole;
}) {
  return invokeAdmin<{ user_id: string; password: string; email: string }>(
    'create_staff',
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
  return invokeAdmin<{ user_id: string; password: string; email: string }>(
    'create_student',
    payload,
  );
}

export async function adminBulkStudents(payload: {
  school_id: string;
  classroom_id: string;
  year?: number | null;
  students: Array<{ full_name: string; email: string; gender?: string | null }>;
}) {
  return invokeAdmin<{
    success: Array<{ email: string; password: string }>;
    errors: Array<{ row: number; email?: string; reason: string }>;
  }>('bulk_students', payload);
}

export async function adminDeleteUser(userId: string): Promise<{ ok: boolean }> {
  return invokeAdmin<{ ok: boolean }>('delete_user', { user_id: userId });
}
