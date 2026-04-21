import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Search,
} from 'lucide-react';
import PenaltyReasonDialog from '@/components/PenaltyReasonDialog';
import { applyPenaltyStandalone, removePenalty } from '@/lib/queue';
import { useToast } from '@/hooks/use-toast';

interface PenaltyRow {
  id: string;
  reason: string | null;
  infraction_number: number | null;
  penalty_percent: number | null;
  created_at: string;
  user_id: string;
  applied_by: string | null;
  classroom_id: string;
  school_id: string;
  student_name: string;
  student_avatar: string | null;
  applied_by_name: string | null;
  classroom_name: string | null;
}

interface StudentOption {
  user_id: string;
  full_name: string;
  classroom_id: string;
  classroom_name: string;
  school_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Classroom scope. If omitted, falls back to school-wide scope. */
  classroomId?: string;
  classroomName?: string;
  /** Required for school-wide scope AND to pass down to applyPenalty. */
  schoolId: string;
  /** If true, shows "Aplicar nova penalidade" + "Remover" buttons. */
  canManage?: boolean;
  /** Current viewer user.id — stored as `applied_by` on new penalties. */
  currentUserId?: string;
}

/**
 * Penalty history + management modal.
 *
 * Scopes:
 *  • Per-classroom (teachers, leaders, vice-leaders) → pass `classroomId`.
 *  • School-wide (management / super-admin) → omit `classroomId`, pass `schoolId`.
 *
 * When `canManage=true`:
 *  • A "Aplicar nova penalidade" button appears: pick a student → reason dialog.
 *    Works even if the student is NOT currently in the queue.
 *  • Each listed penalty gets a "Remover" button.
 */
export const ClassroomPenaltiesDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  classroomId,
  classroomName,
  schoolId,
  canManage,
  currentUserId,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PenaltyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerClassroomFilter, setPickerClassroomFilter] = useState<string>('__all__');
  const [penaltyTarget, setPenaltyTarget] = useState<StudentOption | null>(null);
  const [penaltySubmitting, setPenaltySubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isClassroomScope = !!classroomId;

  const fetchPenalties = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const q = supabase
      .from('penalties')
      .select(
        'id, reason, infraction_number, penalty_percent, created_at, user_id, applied_by, classroom_id, school_id',
      )
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(500);
    const { data: penalties } = isClassroomScope
      ? await q.eq('classroom_id', classroomId!)
      : await q;

    const list = (penalties ?? []) as any[];
    const userIds = Array.from(
      new Set(
        list
          .flatMap((p) => [p.user_id, p.applied_by])
          .filter((u): u is string => !!u),
      ),
    );
    const classroomIds = Array.from(new Set(list.map((p) => p.classroom_id).filter(Boolean)));
    const profMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);
      for (const p of (profs ?? []) as any[]) {
        profMap[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      }
    }
    const classroomMap: Record<string, string> = {};
    if (classroomIds.length) {
      const { data: crs } = await supabase
        .from('classrooms')
        .select('id, name')
        .in('id', classroomIds);
      for (const c of (crs ?? []) as any[]) classroomMap[c.id] = c.name;
    }
    setRows(
      list.map((p) => ({
        id: p.id,
        reason: p.reason,
        infraction_number: p.infraction_number,
        penalty_percent: p.penalty_percent,
        created_at: p.created_at,
        user_id: p.user_id,
        applied_by: p.applied_by,
        classroom_id: p.classroom_id,
        school_id: p.school_id,
        student_name: profMap[p.user_id]?.full_name || 'Aluno desconhecido',
        student_avatar: profMap[p.user_id]?.avatar_url ?? null,
        applied_by_name: p.applied_by
          ? profMap[p.applied_by]?.full_name || 'Usuário'
          : null,
        classroom_name: classroomMap[p.classroom_id] ?? null,
      })),
    );
    setLoading(false);
  }, [schoolId, classroomId, isClassroomScope]);

  const fetchStudents = useCallback(async () => {
    if (!schoolId) return;
    // Get all "aluno" user_ids in this school to cross-filter.
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .eq('role', 'aluno');
    const alunoIds = new Set(((roles ?? []) as any[]).map((r) => r.user_id));

    const baseQ = supabase
      .from('profiles')
      .select('user_id, full_name, classroom_id, school_id')
      .eq('school_id', schoolId)
      .order('full_name');
    const { data: profs } = isClassroomScope
      ? await baseQ.eq('classroom_id', classroomId!)
      : await baseQ;
    const filtered = ((profs ?? []) as any[]).filter(
      (p) => p.classroom_id && alunoIds.has(p.user_id),
    );
    const classIds = Array.from(new Set(filtered.map((p) => p.classroom_id)));
    const classMap: Record<string, string> = {};
    if (classIds.length) {
      const { data: crs } = await supabase
        .from('classrooms')
        .select('id, name')
        .in('id', classIds);
      for (const c of (crs ?? []) as any[]) classMap[c.id] = c.name;
    }
    setStudents(
      filtered.map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        classroom_id: p.classroom_id,
        classroom_name: classMap[p.classroom_id] ?? '—',
        school_id: p.school_id,
      })),
    );
  }, [schoolId, classroomId, isClassroomScope]);

  useEffect(() => {
    if (open) {
      fetchPenalties();
      if (canManage) fetchStudents();
    }
  }, [open, fetchPenalties, fetchStudents, canManage]);

  const handleApplyToStudent = async (reason: string) => {
    if (!penaltyTarget) return;
    setPenaltySubmitting(true);
    try {
      await applyPenaltyStandalone(
        penaltyTarget.user_id,
        penaltyTarget.classroom_id,
        penaltyTarget.school_id,
        reason,
        currentUserId ?? null,
      );
      toast({
        title: 'Penalidade aplicada',
        description: `${penaltyTarget.full_name} (${penaltyTarget.classroom_name})`,
      });
      setPenaltyTarget(null);
      setPickerOpen(false);
      fetchPenalties();
    } catch (err: any) {
      toast({
        title: 'Erro ao aplicar',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setPenaltySubmitting(false);
    }
  };

  const handleRemove = async (id: string, studentName: string) => {
    if (!window.confirm(`Remover esta penalidade de ${studentName}?`)) return;
    setRemovingId(id);
    try {
      await removePenalty(id);
      toast({ title: 'Penalidade removida' });
      fetchPenalties();
    } catch (err: any) {
      toast({
        title: 'Erro ao remover',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setRemovingId(null);
    }
  };

  const classroomOptions = useMemo(() => {
    const uniq = new Map<string, string>();
    for (const s of students) uniq.set(s.classroom_id, s.classroom_name);
    return Array.from(uniq.entries()).map(([id, name]) => ({ id, name }));
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (pickerClassroomFilter !== '__all__' && s.classroom_id !== pickerClassroomFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.classroom_name.toLowerCase().includes(q)
      );
    });
  }, [students, pickerQuery, pickerClassroomFilter]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-warning" />
              Penalidades
              {isClassroomScope && classroomName ? (
                <span className="text-sm font-normal text-muted-foreground">
                  — {classroomName}
                </span>
              ) : (
                <span className="text-sm font-normal text-muted-foreground">
                  — Toda a escola
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {isClassroomScope
                ? 'Histórico de penalidades desta sala.'
                : 'Histórico global de todas as salas da sua escola.'}{' '}
              {canManage && 'Você pode aplicar novas penalidades e remover registros.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {canManage && (
                <Button
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  data-testid="penalty-open-picker-btn"
                  className="gap-1"
                >
                  <UserPlus className="h-4 w-4" />
                  Aplicar nova penalidade
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPenalties}
              disabled={loading}
              data-testid="penalties-refresh-btn"
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {rows.length === 0 && !loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma penalidade registrada.
              </p>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-border bg-card p-3"
                  data-testid={`penalty-row-${r.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border bg-secondary">
                        {r.student_avatar ? (
                          <img
                            src={r.student_avatar}
                            alt={r.student_name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                            {(r.student_name || '?').slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {r.student_name}
                          {!isClassroomScope && r.classroom_name ? (
                            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              {r.classroom_name}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(r.created_at)}
                          {r.applied_by_name ? (
                            <>
                              {' '}· por{' '}
                              <span className="font-medium text-foreground">
                                {r.applied_by_name}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {r.infraction_number ?? '?'}ª
                        {r.penalty_percent ? ` · ${r.penalty_percent}%` : ''}
                      </span>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRemove(r.id, r.student_name)}
                          disabled={removingId === r.id}
                          data-testid={`penalty-remove-${r.id}`}
                          title="Remover penalidade"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {r.reason ? (
                    <p className="mt-2 rounded-md bg-muted/50 p-2 text-sm text-foreground">
                      <span className="font-semibold">Motivo: </span>
                      {r.reason}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs italic text-muted-foreground">
                      Sem motivo registrado.
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Student picker (only active when canManage=true and user clicked "Aplicar nova penalidade") */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
          <DialogHeader>
            <DialogTitle>Selecionar aluno</DialogTitle>
            <DialogDescription>
              Aplica uma penalidade mesmo se o aluno não estiver na fila.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                className="pl-8"
                data-testid="penalty-picker-search"
              />
            </div>
            {!isClassroomScope && classroomOptions.length > 1 && (
              <Select value={pickerClassroomFilter} onValueChange={setPickerClassroomFilter}>
                <SelectTrigger className="sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as salas</SelectItem>
                  {classroomOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
            {filteredStudents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum aluno encontrado.
              </p>
            ) : (
              filteredStudents.map((s) => (
                <button
                  key={s.user_id}
                  type="button"
                  onClick={() => setPenaltyTarget(s)}
                  className="flex w-full items-center justify-between rounded-md border border-transparent p-2 text-left text-sm transition hover:border-border hover:bg-muted/50"
                  data-testid={`penalty-picker-student-${s.user_id}`}
                >
                  <span className="truncate font-medium text-foreground">{s.full_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.classroom_name}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reason capture */}
      <PenaltyReasonDialog
        open={!!penaltyTarget}
        onOpenChange={(o) => {
          if (!o) setPenaltyTarget(null);
        }}
        studentName={penaltyTarget?.full_name || ''}
        onConfirm={handleApplyToStudent}
        submitting={penaltySubmitting}
      />
    </>
  );
};

export default ClassroomPenaltiesDialog;
