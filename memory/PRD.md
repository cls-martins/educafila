# EducaFila — Sistema Inteligente de Gestão de Filas Escolares

## Problema original
Sistema para gerir filas (ex.: banheiro) nas EEEPs do Ceará. Papéis:
super_admin, gestão, professor, aluno.

## Arquitetura
- **Frontend:** React + Vite + Tailwind + shadcn/ui. Hospedado na Vercel.
- **Backend/Auth/DB:** Supabase (PostgreSQL + Auth + RLS).
- **Ações admin privilegiadas:** Supabase **Edge Function** `admin-users`
  (substitui o antigo backend FastAPI, que não podia ser servido via Vercel).

## Fluxos principais
- Aluno faz login → entra na fila da sua sala.
- Professor controla fila da sala (liberar, penalizar).
- Gestão visualiza dashboard da escola.
- Super_admin cria escolas, cursos, salas, professores e alunos.

## Esquema de DB (resumo)
- `profiles` (user_id, full_name, email, school_id, classroom_id, gender, year, is_active)
- `user_roles` (user_id, role) — roles: super_admin, gestao, professor, aluno
- `teacher_schools` (user_id, school_id)
- `courses` (id, name, school_id)
- `classrooms` (id, name, course_id, school_id)
- `queue_entries`

## Implementado
- ✅ Login + routing por papel + fim do domínio fixo (`@prof.ce.gov.br`).
- ✅ Fix do duplo login no `AuthContext`.
- ✅ SuperAdminDashboard: aba **Cursos** com auto-criação 1º/2º/3º ano,
  remoção da aba "Novos", soft delete + hard delete.
- ✅ `vercel.json` SPA rewrites.
- ✅ **Edge Function `admin-users`** (único endpoint, roteada por `action`):
  create_staff, create_student, bulk_students, delete_user. Valida JWT +
  super_admin server-side; usa service_role para bypass RLS.
- ✅ `adminApi.ts` migrado de `fetch('/api/admin/...')` para
  `supabase.functions.invoke('admin-users', { body: { action, ... } })`.
- ✅ Guia de deploy: `/app/supabase/functions/admin-users/DEPLOY.md`.

## Deploy pendente pelo usuário (P0)
1. Abrir Dashboard Supabase → Edge Functions → Create `admin-users`.
2. Colar o código de `/app/supabase/functions/admin-users/index.ts`.
3. Adicionar secret `SUPABASE_SERVICE_ROLE_KEY` (Settings → API).
4. Testar criar/deletar aluno no SuperAdminDashboard em produção.

## Backlog (P1)
- Remover/arquivar `/app/backend` (FastAPI) após confirmar Edge Function ok.
- Testes de regressão e2e dos fluxos de admin pós-deploy.
- Tratar edge cases dos triggers (já cobertos por upsert/update+fallback).

## P2 / Futuro
- Métricas/BI para gestão.
- Notificações em tempo real (Supabase realtime).
- Aplicativo mobile / PWA.

## Tech stack
React 18, Vite, TypeScript, Tailwind, shadcn/ui, Supabase JS v2,
Deno (Edge Functions), Vercel.

## Credenciais
Super admin: ver `/app/memory/test_credentials.md`.
