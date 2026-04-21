import React, { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, RefreshCw, Shield } from 'lucide-react';

interface PenaltyRow {
  id: string;
  reason: string | null;
  infraction_number: number | null;
  penalty_percent: number | null;
  created_at: string;
  user_id: string;
  applied_by: string | null;
  student_name: string;
  student_avatar: string | null;
  applied_by_name: string | null;
}

interface ClassroomPenaltiesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomId: string;
  classroomName?: string;
}

/**
 * Read-only list of all penalties applied in a classroom. Shown to teachers
 * (and leaders/vice-leaders) so they can audit who applied each penalty and
 * the reason given. Students NEVER see this — they only see their own
 * reasons in a banner on their dashboard.
 */
export const ClassroomPenaltiesDialog: React.FC<ClassroomPenaltiesDialogProps> = ({
  open,
  onOpenChange,
  classroomId,
  classroomName,
}) => {
  const [rows, setRows] = useState<PenaltyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPenalties = useCallback(async () => {
    if (!classroomId) return;
    setLoading(true);
    const { data: penalties } = await supabase
      .from('penalties')
      .select(
        'id, reason, infraction_number, penalty_percent, created_at, user_id, applied_by',
      )
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(200);
    const list = (penalties ?? []) as any[];
    const userIds = Array.from(
      new Set(
        list
          .flatMap((p) => [p.user_id, p.applied_by])
          .filter((u): u is string => !!u),
      ),
    );
    let profMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);
      for (const p of (profs ?? []) as any[]) {
        profMap[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
      }
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
        student_name: profMap[p.user_id]?.full_name || 'Aluno desconhecido',
        student_avatar: profMap[p.user_id]?.avatar_url ?? null,
        applied_by_name: p.applied_by
          ? profMap[p.applied_by]?.full_name || 'Usuário'
          : null,
      })),
    );
    setLoading(false);
  }, [classroomId]);

  useEffect(() => {
    if (open) fetchPenalties();
  }, [open, fetchPenalties]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-warning" />
            Penalidades da Sala
            {classroomName ? (
              <span className="text-sm font-normal text-muted-foreground">
                — {classroomName}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Histórico completo de penalidades aplicadas nesta sala. Somente
            professores, líder e vice-líder visualizam esta tela.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
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
              Nenhuma penalidade registrada nesta sala.
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
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    {r.infraction_number ?? '?'}ª
                    {r.penalty_percent ? ` · ${r.penalty_percent}%` : ''}
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
  );
};

export default ClassroomPenaltiesDialog;
