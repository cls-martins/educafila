# Deploy da Edge Function `admin-users` no Supabase

Esta Edge Function substitui o backend Python (`/app/backend/server.py`) e é
necessária para que as ações de **criar aluno, criar professor/gestão, importar
em massa e deletar usuário** funcionem no frontend hospedado na Vercel.

Project ref: **zoikoxzdjhxlqglxdaik**
URL: `https://zoikoxzdjhxlqglxdaik.supabase.co`

---

## Caminho mais fácil — Supabase Dashboard (sem CLI)

### 1) Abrir o projeto
- Acesse https://supabase.com/dashboard/project/zoikoxzdjhxlqglxdaik
- Menu lateral → **Edge Functions**

### 2) Criar a função
- Clique em **Create a new function**
- Nome: `admin-users` (exatamente assim, com hífen)
- Na aba **Code**, cole TODO o conteúdo de:
  `/app/supabase/functions/admin-users/index.ts`
- Clique em **Deploy function**

### 3) Configurar os Secrets (variáveis de ambiente)
Ainda em **Edge Functions**, clique em **Manage secrets** (ou
Project Settings → Edge Functions → Secrets) e adicione:

| Nome                          | Valor                                    |
| ----------------------------- | ---------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`   | (sua service_role key — Settings → API) |

> **Importante:** `SUPABASE_URL` e `SUPABASE_ANON_KEY` já são injetados
> automaticamente pelo Supabase. Você só precisa configurar
> `SUPABASE_SERVICE_ROLE_KEY`.

### 4) Onde encontrar a service_role key
Dashboard → **Project Settings** → **API** → seção "Project API keys" →
copie a linha **`service_role`** (ela é secreta, nunca commite no git).

### 5) Pronto!
Teste criando um aluno/professor no Dashboard SuperAdmin em produção
(Vercel). Se der erro, veja os logs em:
Dashboard → Edge Functions → `admin-users` → **Logs**.

---

## Alternativa — Supabase CLI (se preferir terminal)

### Pré-requisitos
- Node 18+
- Instalar a CLI:
  ```bash
  npm install -g supabase
  # ou, no macOS:
  brew install supabase/tap/supabase
  ```

### Passos
```bash
# 1) Login (abre o navegador)
supabase login

# 2) Na raiz do repo (/app), linkar ao projeto
supabase link --project-ref zoikoxzdjhxlqglxdaik

# 3) Configurar o secret (cole sua service_role key)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...  \
  --project-ref zoikoxzdjhxlqglxdaik

# 4) Deploy
supabase functions deploy admin-users --project-ref zoikoxzdjhxlqglxdaik
```

---

## Smoke test via curl (opcional)

```bash
# Pegue um access_token de super_admin logado no app (DevTools → Application → Local Storage
# → chave sb-...-auth-token → access_token).

ACCESS_TOKEN="<cole_o_token_do_super_admin_aqui>"

curl -X POST \
  "https://zoikoxzdjhxlqglxdaik.supabase.co/functions/v1/admin-users" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"create_student","full_name":"Teste Aluno","email":"teste.aluno@example.com","school_id":"<school_uuid>","classroom_id":"<classroom_uuid>"}'
```

Resposta esperada:
```json
{ "user_id": "...", "password": "teste.aluno@edu2026", "email": "teste.aluno@example.com" }
```

---

## Troubleshooting

- **401 "Token inválido"** → usuário não está logado ou o token expirou.
- **403 "Acesso restrito a super_admin"** → o usuário logado não tem a role
  `super_admin` em `user_roles`.
- **400 "A user with this email..."** → e-mail já cadastrado no Supabase Auth.
- **500 na function** → abrir Dashboard → Edge Functions → Logs para ver o stack trace.
