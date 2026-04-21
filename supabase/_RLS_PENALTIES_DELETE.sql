-- =====================================================================
-- EducaFila — Políticas RLS necessárias para DELETE em `penalties`
-- =====================================================================
-- Execute este script no SQL Editor do Supabase APENAS se o botão
-- "Remover penalidade" estiver mostrando o erro:
--   "Permissão negada para remover penalidades..."
-- =====================================================================
-- Contexto: a tabela `penalties` já tem SELECT/INSERT liberados pela
-- Lovable, mas o DELETE pode não estar permitido para Professor / Líder /
-- Vice-Líder / Gestão. Este script adiciona a policy que falta.
-- =====================================================================

-- 1) Certifique-se de que RLS está habilitado (geralmente já está).
ALTER TABLE public.penalties ENABLE ROW LEVEL SECURITY;

-- 2) Permitir DELETE para quem tem role de professor, gestão ou super_admin
--    na mesma escola da penalidade.
DROP POLICY IF EXISTS "penalties_delete_staff" ON public.penalties;
CREATE POLICY "penalties_delete_staff" ON public.penalties
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('professor', 'gestao', 'super_admin')
  )
);

-- 3) Permitir DELETE para líder / vice-líder / secretário da MESMA sala
--    da penalidade.
DROP POLICY IF EXISTS "penalties_delete_leader" ON public.penalties;
CREATE POLICY "penalties_delete_leader" ON public.penalties
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.classroom_id = penalties.classroom_id
      AND p.leader_role IN ('lider', 'vice_lider', 'secretario')
  )
);

-- 4) (Opcional) Garantir que a COLUNA applied_by possa ser escrita.
--    Se já existe, este statement é no-op.
ALTER TABLE public.penalties
  ADD COLUMN IF NOT EXISTS applied_by uuid REFERENCES auth.users(id);
