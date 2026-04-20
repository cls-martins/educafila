# EducaFila — Sistema Inteligente de Gestão de Filas Escolares

## Problema original
Sistema para gerir filas (ex.: banheiro) nas EEEPs do Ceará. Papéis:
super_admin, gestão, professor, aluno.

## Arquitetura
- **Frontend:** React + Vite + TS + Tailwind + shadcn/ui. Hospedado na Vercel.
- **Backend/Auth/DB:** Supabase (PostgreSQL + Auth + RLS).
- **Ações admin privilegiadas:** Supabase **Edge Function** `admin-users`
  (criada em fev/2026) com `verify_jwt=false` (ES256 signing keys) e
  validação de super_admin feita no próprio código.

## Esquema de DB (pontos-chave)
- `profiles`: id, user_id, school_id, classroom_id, full_name, email,
  **display_name_tokens text[]**, **name_color text**, **theme 'light|dark'**,
  is_active, ... (user_id UNIQUE)
- `user_roles`: user_id, role
- `teacher_schools`: user_id, school_id
- `courses` / `classrooms`: por escola
- `queue_entries`: id, school_id, classroom_id, user_id, position, status,
  **penalty_count int default 0**
  - **UNIQUE INDEX parcial** (classroom_id,user_id) WHERE status IN
    ('waiting','in_bathroom','called')
- `penalties`: escalonado — 1ª infração = 30% de recuo, seguintes = +10% cada
- `swap_requests`: requester_id, target_id, status, ...
- **`bathroom_schedules`** (novo): school_id, weekday 1-6, start_time, end_time,
  is_active — RLS: leitura todos, escrita super_admin+gestao.
- FKs para PostgREST embed: `queue_entries.user_id`, `swap_requests.{requester,target}_id`
  → `profiles.user_id`.

## Implementado
### Admin / Deploy
- Login + routing por papel + domínio fixo removido.
- Duplo-login consertado no AuthContext.
- SuperAdminDashboard: Cursos (auto 1º/2º/3º), Salas, Equipe, Horários, Virada.
- Edge Function `admin-users` deployada (actions: create_staff, create_student,
  bulk_students, delete_user). `verify_jwt=false` por causa das ES256 signing
  keys do projeto. `delete_user` tolera user_not_found.
- `adminApi.ts` refatorado para `supabase.functions.invoke` + extração correta
  do erro (context É o Response em supabase-js v2).
- `vercel.json` SPA rewrites.

### Core da Fila (fev/2026)
- **Horários da fila** (`bathroom_schedules`): CRUD via `ScheduleManager` exposto
  em SuperAdminDashboard (aba Horários por escola) e ManagementDashboard
  (aba Horários). Seg-sáb, múltiplos horários por dia.
- **StudentDashboard redesenhado** como o mockup do usuário:
  - Card de horários com status "Fila Aberta/Fechada" + próximo horário + lista
    dos horários do dia.
  - Botão "Entrar na Fila" grande (bloqueado quando fechada).
  - Card da posição + ações (Sair / Trocar / Ir ao Banheiro) + timer.
  - Lista "Lista do Banheiro — <sala>" com nomes coloridos e badge de
    penalidades.
  - Realtime via Supabase channel para atualização instantânea.
- **Menu do aluno** (dropdown): Perfil, Modo Claro/Escuro, Ajuda, App, Sair.
- **ProfileDialog**: escolher ≥2 tokens do nome + cor personalizada
  (palette + color picker). Branco e tons claros bloqueados. Preview em tempo
  real. Update via `.select()` para detectar falhas silenciosas de RLS.
- **ThemeContext**: toggle dark/light, classe `.dark` no <html>, persistência
  em `profiles.theme` e localStorage.
- **HelpDialog**: guia visual explicando horários, fila, troca, penalidades,
  perfil, modo escuro e app.
- **AppDownloadDialog**: placeholder "Em breve" para .apk Android.
- **TeacherDashboard**: botão de penalidade usa `lib/queue.applyPenalty`
  (escalonado 30%+10% + move posição + atualiza `penalty_count`). Badge de
  penalidades visível na fila.
- **enterQueue** idempotente + **leaveQueue** apaga todas as linhas ativas do
  usuário. Unique partial index evita duplicatas por race.
- Queries sem embed (duas queries + merge em JS) para contornar limitações do
  PostgREST quando FK não está no schema cache.

## Testes
- iter 1: ✅ identificou PGRST200
- iter 2: ✅ ~90% pass; cor + duplicatas pendentes
- iter 3: ✅ **100%** dos 9 cenários (enter/leave x3 sem duplicatas, cor
  aplica na hora, branco bloqueado, menu completo, dark mode, ajuda, app,
  logout).

## Backlog (P1)
- Testes e2e dos fluxos de gestão/super_admin nas abas Horários (credenciais
  não fornecidas ao testing agent).
- RPC server-side para `enterQueue` atômico (atualmente read-max + insert
  client-side; unique index cobre o race, mas geraria erro 23505 visual).
- Refatorar/remover `/app/backend` (FastAPI legado).

## P2 / Futuro
- Empacotamento .apk (PWA + Trusted Web Activity ou Capacitor).
- Notificações push (Supabase realtime já pronto).
- Métricas/BI para gestão.

## Credenciais
Ver `/app/memory/test_credentials.md`.
