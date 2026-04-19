// Supabase Edge Function: admin-users
// Single-function router for admin operations on EducaFila.
// Requires env/secret: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// (SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected by Supabase.)
//
// Auth model:
//  - Caller must send `Authorization: Bearer <user_jwt>` in the request.
//  - Function validates the JWT, confirms the caller has role = 'super_admin'
//    (via user_roles table, using service_role), and only then performs the
//    privileged operation using the service_role key (which bypasses RLS).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

// --- Helpers ---------------------------------------------------------------

function generatePassword(name: string): string {
  // Match frontend/Python scheme: lowercase, spaces -> ".", strip accents, + @edu2026
  const clean = name
    .toLowerCase()
    .replace(/\s+/g, ".")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return `${clean}@edu2026`;
}

// Admin client (service role) — bypasses RLS
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verifySuperAdmin(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw { status: 401, detail: "Authorization Bearer token ausente" };
  }
  const token = authHeader.slice(7).trim();

  // Validate JWT and get user via anon-key client
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    throw { status: 401, detail: "Token inválido ou expirado" };
  }
  const userId = userData.user.id;

  // Confirm super_admin role via service_role
  const { data: roles, error: rolesErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesErr) throw { status: 500, detail: `Falha ao ler roles: ${rolesErr.message}` };
  const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
  if (!isSuper) throw { status: 403, detail: "Acesso restrito a super_admin" };
  return userId;
}

async function adminCreateAuthUser(
  email: string,
  password: string,
  full_name: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data?.user?.id) {
    const msg = error?.message || "Erro ao criar usuário";
    throw { status: 400, detail: `Erro ao criar usuário: ${msg}` };
  }
  return data.user.id;
}

async function deleteAuthUser(userId: string) {
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}

async function updateProfile(userId: string, updates: Record<string, any>) {
  // Profile row is auto-created by a Supabase trigger on auth.user insert.
  // UPDATE first; if no row matched, fallback to INSERT.
  const { data, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select();
  if (error) throw { status: 400, detail: `Erro ao atualizar profile: ${error.message}` };
  if (!data || data.length === 0) {
    const { error: insErr } = await admin
      .from("profiles")
      .insert({ ...updates, user_id: userId });
    if (insErr) throw { status: 400, detail: `Erro ao inserir profile: ${insErr.message}` };
  }
}

async function upsertRole(userId: string, role: string) {
  const { error } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  if (error) throw { status: 400, detail: `Erro em user_roles: ${error.message}` };
}

async function upsertTeacherSchool(userId: string, schoolId: string) {
  const { error } = await admin
    .from("teacher_schools")
    .upsert(
      { user_id: userId, school_id: schoolId },
      { onConflict: "user_id,school_id" },
    );
  if (error) throw { status: 400, detail: `Erro em teacher_schools: ${error.message}` };
}

// --- Action handlers -------------------------------------------------------

async function createStaff(body: any) {
  const { full_name, email: rawEmail, school_id, role } = body ?? {};
  if (!full_name || !rawEmail || !school_id) {
    throw { status: 400, detail: "full_name, email e school_id são obrigatórios" };
  }
  if (role !== "professor" && role !== "gestao") {
    throw { status: 400, detail: "role deve ser 'professor' ou 'gestao'" };
  }
  const email = String(rawEmail).toLowerCase().trim();
  const password = body.password || generatePassword(full_name);

  const userId = await adminCreateAuthUser(email, password, full_name);
  try {
    await updateProfile(userId, {
      full_name,
      email,
      school_id,
      is_active: true,
    });
    await upsertRole(userId, role);
    if (role === "professor") {
      await upsertTeacherSchool(userId, school_id);
    }
  } catch (e) {
    await deleteAuthUser(userId);
    throw e;
  }
  return { user_id: userId, password, email };
}

async function createStudent(body: any) {
  const { full_name, email: rawEmail, school_id, classroom_id, gender, year } =
    body ?? {};
  if (!full_name || !rawEmail || !school_id || !classroom_id) {
    throw {
      status: 400,
      detail: "full_name, email, school_id e classroom_id são obrigatórios",
    };
  }
  const email = String(rawEmail).toLowerCase().trim();
  const password = body.password || generatePassword(full_name);

  const userId = await adminCreateAuthUser(email, password, full_name);
  try {
    await updateProfile(userId, {
      full_name,
      email,
      school_id,
      classroom_id,
      gender: gender ?? null,
      year: year ?? null,
      is_active: true,
    });
    await upsertRole(userId, "aluno");
  } catch (e) {
    await deleteAuthUser(userId);
    throw e;
  }
  return { user_id: userId, password, email };
}

async function bulkStudents(body: any) {
  const { school_id, classroom_id, year, students } = body ?? {};
  if (!school_id || !classroom_id || !Array.isArray(students)) {
    throw {
      status: 400,
      detail: "school_id, classroom_id e students[] são obrigatórios",
    };
  }
  const results: {
    success: Array<{ email: string; password: string }>;
    errors: Array<{ row: number; email?: string; reason: string }>;
  } = { success: [], errors: [] };

  for (let idx = 0; idx < students.length; idx++) {
    const s = students[idx] ?? {};
    try {
      const full_name = String(
        s.full_name ?? s.nome ?? s.name ?? "",
      ).trim();
      const email = String(s.email ?? "").toLowerCase().trim();
      const gender = s.gender ?? s.genero ?? null;
      if (!full_name || !email) {
        results.errors.push({ row: idx, reason: "nome ou email ausente" });
        continue;
      }
      const password = generatePassword(full_name);
      const userId = await adminCreateAuthUser(email, password, full_name);
      try {
        await updateProfile(userId, {
          full_name,
          email,
          school_id,
          classroom_id,
          gender,
          year: year ?? null,
          is_active: true,
        });
        await upsertRole(userId, "aluno");
        results.success.push({ email, password });
      } catch (e: any) {
        await deleteAuthUser(userId);
        results.errors.push({
          row: idx,
          email,
          reason: e?.detail || e?.message || String(e),
        });
      }
    } catch (e: any) {
      results.errors.push({
        row: idx,
        reason: e?.detail || e?.message || String(e),
      });
    }
  }
  return results;
}

async function deleteUser(body: any) {
  const userId = body?.user_id;
  if (!userId) throw { status: 400, detail: "user_id é obrigatório" };

  // Dependent tables first (ignore missing rows)
  for (const table of ["queue_entries", "teacher_schools", "user_roles", "profiles"]) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) {
      console.warn(`delete ${table} for ${userId}: ${error.message}`);
    }
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw { status: 400, detail: `Falha ao apagar auth user: ${error.message}` };
  }
  return { ok: true };
}

// --- Router ----------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ detail: "Método não permitido" }, 405);
  }
  try {
    await verifySuperAdmin(req.headers.get("Authorization"));
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    switch (action) {
      case "create_staff":
        return json(await createStaff(body));
      case "create_student":
        return json(await createStudent(body));
      case "bulk_students":
        return json(await bulkStudents(body));
      case "delete_user":
        return json(await deleteUser(body));
      default:
        return json({ detail: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const detail = e?.detail || e?.message || "Erro interno";
    console.error("admin-users error:", detail);
    return json({ detail }, status);
  }
});
