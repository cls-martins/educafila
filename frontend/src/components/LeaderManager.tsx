import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Crown, UserCog } from 'lucide-react';

type LeaderRole = 'lider' | 'vice_lider' | 'secretario';

const LABEL: Record<LeaderRole, string> = {
  lider: 'Líder',
  vice_lider: 'Vice-Líder',
  secretario: 'Secretário',
};

interface ClassroomRow {
  id: string;
  name: string;
}

interface StudentRow {
  user_id: string;
  full_name: string;
  classroom_id: string | null;
  leader_role: LeaderRole | null;
}

interface Props {
  schoolId: string;
}

export const LeaderManager: React.FC<Props> = ({ schoolId }) => {
  const { toast } = useToast();
  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!schoolId) return;
      const { data } = await supabase
        .from('classrooms')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('name');
      setClassrooms((data as any) ?? []);
    })();
  }, [schoolId]);

  const loadStudents = useCallback(async () => {
    if (!selectedClassroom) {
      setStudents([]);
      return;
    }
    setLoading(true);
    // Students of this classroom. We identify students as "profile with a
    // classroom_id" (teachers/management don't have classroom_id on their
    // profile). We deliberately avoid cross-filtering by `user_roles` because
    // its RLS typically only exposes the caller's OWN role, which would
    // return an empty set for Management / SuperAdmin and break this picker.
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, full_name, classroom_id, leader_role')
      .eq('classroom_id', selectedClassroom)
      .order('full_name');
    setStudents(((profs as any) ?? []));
    setLoading(false);
  }, [selectedClassroom]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const setRole = async (userId: string, role: LeaderRole | null) => {
    setLoading(true);
    // If assigning, first clear any other student in the classroom that has this role
    // (otherwise unique index would reject).
    if (role) {
      await supabase
        .from('profiles')
        .update({ leader_role: null } as any)
        .eq('classroom_id', selectedClassroom)
        .eq('leader_role', role);
    }
    const { error } = await supabase
      .from('profiles')
      .update({ leader_role: role } as any)
      .eq('user_id', userId);
    setLoading(false);
    if (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: role ? `Definido como ${LABEL[role]}` : 'Função removida',
    });
    loadStudents();
  };

  return (
    <div className="space-y-4" data-testid="leader-manager">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <UserCog className="h-4 w-4 text-primary" /> Líderes de sala
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Um líder, um vice-líder e um secretário por sala. Eles podem remover alunos da
          fila e aplicar penalidades — ajuda o professor a não ser interrompido.
        </p>
        <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
          <SelectTrigger data-testid="leader-classroom-select">
            <SelectValue placeholder="Selecione a sala" />
          </SelectTrigger>
          <SelectContent>
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedClassroom && (
        <div className="rounded-lg border bg-card p-4">
          {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
          {!loading && students.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum aluno ativo nessa sala.</p>
          )}
          <div className="space-y-2">
            {students.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between gap-3 rounded border p-2"
                data-testid={`leader-student-${s.user_id}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {s.leader_role && (
                    <Crown className="h-4 w-4 shrink-0 text-[#F37021]" />
                  )}
                  <span className="truncate text-sm font-medium">{s.full_name}</span>
                  {s.leader_role && (
                    <span className="rounded-full bg-[#F37021]/10 px-2 py-0.5 text-xs font-semibold text-[#F37021]">
                      {LABEL[s.leader_role]}
                    </span>
                  )}
                </div>
                <Select
                  value={s.leader_role ?? 'none'}
                  onValueChange={(v) =>
                    setRole(s.user_id, v === 'none' ? null : (v as LeaderRole))
                  }
                >
                  <SelectTrigger
                    className="w-[160px]"
                    data-testid={`leader-role-select-${s.user_id}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem função</SelectItem>
                    <SelectItem value="lider">Líder</SelectItem>
                    <SelectItem value="vice_lider">Vice-Líder</SelectItem>
                    <SelectItem value="secretario">Secretário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
