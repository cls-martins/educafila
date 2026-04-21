import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useBathroomTimer } from '@/hooks/useBathroomTimer';
import {
  enterQueue,
  leaveQueue,
  startBathroom,
  finishBathroom,
  requestSwap,
  respondToSwap,
  clearClassroomQueue,
  maybeWipeStaleQueue,
} from '@/lib/queue';
import PenaltyReasonDialog from '@/components/PenaltyReasonDialog';
import ClassroomPenaltiesDialog from '@/components/ClassroomPenaltiesDialog';
import { applyPenalty } from '@/lib/queue';
import { fetchSchedules, computeStatus, BathroomSchedule } from '@/lib/schedule';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  LogIn,
  LogOut,
  Clock,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
} from 'lucide-react';
import { StudentMenu } from '@/components/StudentMenu';

type QueueRow = {
  id: string;
  user_id: string;
  position: number;
  status: string;
  penalty_count?: number;
  profiles?: {
    full_name: string;
    display_name_tokens: string[] | null;
    name_color: string | null;
    avatar_url: string | null;
    gender: string | null;
    leader_role?: 'lider' | 'vice_lider' | 'secretario' | null;
  };
};

const LEADER_LABEL: Record<string, string> = {
  lider: 'Líder',
  vice_lider: 'Vice-Líder',
  secretario: 'Secretário',
};

function renderDisplayName(p?: QueueRow['profiles'], fallbackColor = 'currentColor') {
  if (!p) return { text: 'Aluno', color: fallbackColor };
  const tokens = (p.display_name_tokens || []).filter(Boolean);
  const text = tokens.length > 0 ? tokens.join(' ') : p.full_name || 'Aluno';
  return { text, color: p.name_color || fallbackColor };
}

const StudentDashboard = () => {
  const { user, profile, activeSchoolId } = useAuth();
  const { toast } = useToast();

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [myEntry, setMyEntry] = useState<QueueRow | null>(null);
  const [classroomName, setClassroomName] = useState<string>('');
  const [isInBathroom, setIsInBathroom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState<BathroomSchedule[]>([]);
  const [timeoutAlert, setTimeoutAlert] = useState<{ name: string; at: number } | null>(null);
  const [splitByGender, setSplitByGender] = useState(false);
  const [nowTick, setNowTick] = useState(0); // re-render each minute
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [incomingSwap, setIncomingSwap] = useState<any>(null);
  const [incomingSwapDialogOpen, setIncomingSwapDialogOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [penaltyTarget, setPenaltyTarget] = useState<{ userId: string; name: string } | null>(null);
  const [penaltySubmitting, setPenaltySubmitting] = useState(false);
  const [penaltiesListOpen, setPenaltiesListOpen] = useState(false);
  const [myPenalties, setMyPenalties] = useState<any[]>([]);
  const [dismissedPenaltyIds, setDismissedPenaltyIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('educafila:dismissedPenalties');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const prevQueueOpenRef = React.useRef<boolean | null>(null);

  const classroomId = profile?.classroom_id;

  // Tick every 30s to keep the "fila aberta/fechada" fresh.
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Dismiss the timeout alert after 3 min from the incident.
  useEffect(() => {
    if (!timeoutAlert) return;
    if (Date.now() - timeoutAlert.at > 3 * 60 * 1000) setTimeoutAlert(null);
  }, [nowTick, timeoutAlert]);

  const scheduleStatus = useMemo(
    () => computeStatus(schedules, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedules, nowTick],
  );

  const fetchClassroom = useCallback(async () => {
    if (!classroomId) return;
    const { data } = await supabase
      .from('classrooms')
      .select('name, split_queue_by_gender')
      .eq('id', classroomId)
      .maybeSingle();
    if (data) {
      setClassroomName((data as any).name);
      setSplitByGender(!!(data as any).split_queue_by_gender);
    }
  }, [classroomId]);

  const fetchQueue = useCallback(async () => {
    if (!classroomId || !activeSchoolId) return;
    const { data: entries, error: qErr } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('classroom_id', classroomId)
      .eq('school_id', activeSchoolId)
      .order('position', { ascending: true });
    if (qErr) {
      toast({
        title: 'Erro ao carregar fila',
        description: qErr.message,
        variant: 'destructive',
      });
      return;
    }
    const rows = (entries ?? []) as any[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    let profilesMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, display_name_tokens, name_color, leader_role, avatar_url, gender')
        .in('user_id', userIds);
      for (const p of (profs ?? []) as any[]) profilesMap[p.user_id] = p;
    }
    const merged = rows.map((r) => ({
      ...r,
      profiles: profilesMap[r.user_id]
        ? {
            full_name: profilesMap[r.user_id].full_name,
            display_name_tokens: profilesMap[r.user_id].display_name_tokens,
            name_color: profilesMap[r.user_id].name_color,
            leader_role: profilesMap[r.user_id].leader_role,
            avatar_url: profilesMap[r.user_id].avatar_url,
            gender: profilesMap[r.user_id].gender,
          }
        : undefined,
    }));
    setQueue(merged);
    const mine = merged.find((e: any) => e.user_id === user?.id);
    setMyEntry(mine || null);
    setIsInBathroom(mine?.status === 'in_bathroom');
  }, [classroomId, activeSchoolId, user?.id, toast]);

  const fetchIncomingSwaps = useCallback(async () => {
    if (!user?.id || !classroomId) return;
    const { data } = await supabase
      .from('swap_requests')
      .select('*')
      .eq('target_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('status', 'pending')
      .limit(1);
    if (data && data.length > 0) {
      const req = data[0] as any;
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', req.requester_id)
        .maybeSingle();
      setIncomingSwap({ ...req, profiles: prof || undefined });
      setIncomingSwapDialogOpen(true);
    }
  }, [user?.id, classroomId]);

  const loadSchedules = useCallback(async () => {
    if (!activeSchoolId) return;
    const data = await fetchSchedules(activeSchoolId);
    setSchedules(data);
  }, [activeSchoolId]);

  // Watch recent "exceeded" bathroom logs for this classroom and show a banner
  // for 3 minutes after the incident. Other students see: "Fulano demorou — a
  // fila continua normalmente."
  const checkTimeoutAlert = useCallback(async () => {
    if (!classroomId || !activeSchoolId) return;
    const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('bathroom_logs')
      .select('id, user_id, end_time')
      .eq('classroom_id', classroomId)
      .eq('exceeded', true)
      .gte('end_time', since)
      .order('end_time', { ascending: false })
      .limit(1);
    if (!data || data.length === 0) {
      setTimeoutAlert(null);
      return;
    }
    const row = data[0] as any;
    if (row.user_id === user?.id) {
      setTimeoutAlert(null);
      return;
    }
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, display_name_tokens')
      .eq('user_id', row.user_id)
      .maybeSingle();
    const tokens = ((prof as any)?.display_name_tokens || []) as string[];
    const name =
      (tokens.length > 0 ? tokens.join(' ') : (prof as any)?.full_name) || 'Um colega';
    setTimeoutAlert({ name, at: new Date(row.end_time).getTime() });
  }, [classroomId, activeSchoolId, user?.id]);

  useEffect(() => {
    fetchClassroom();
    fetchQueue();
    fetchIncomingSwaps();
    loadSchedules();
    checkTimeoutAlert();
    if (!classroomId) return;
    // Unique channel name per classroom + mount avoids collisions when the
    // user switches classrooms or the app hot-reloads in dev.
    const channelName = `student-queue-${classroomId}-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries', filter: `classroom_id=eq.${classroomId}` },
        fetchQueue,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'swap_requests', filter: `classroom_id=eq.${classroomId}` },
        fetchIncomingSwaps,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bathroom_logs', filter: `classroom_id=eq.${classroomId}` },
        checkTimeoutAlert,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'classrooms', filter: `id=eq.${classroomId}` },
        fetchClassroom,
      )
      .subscribe();

    // --- Polling fallback ---------------------------------------------------
    // If Supabase Realtime publication isn't enabled for one of these tables,
    // or the websocket drops silently, we still want the UI to stay fresh.
    // Refresh every 8s — cheap queries, high perceived responsiveness.
    const poll = setInterval(() => {
      fetchQueue();
      fetchIncomingSwaps();
    }, 8000);

    // Periodic stale-queue cleanup: any online student also enforces the
    // "fresh queue when window opens" rule, so leftover entries from a
    // previous session never persist — even if nobody was online at close.
    const staleCheck = setInterval(() => {
      if (classroomId && activeSchoolId) {
        maybeWipeStaleQueue(classroomId, activeSchoolId).then((wiped) => {
          if (wiped) fetchQueue();
        });
      }
    }, 60_000);
    if (classroomId && activeSchoolId) {
      maybeWipeStaleQueue(classroomId, activeSchoolId).then((wiped) => {
        if (wiped) fetchQueue();
      });
    }

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
      clearInterval(staleCheck);
    };
  }, [fetchClassroom, fetchQueue, fetchIncomingSwaps, loadSchedules, checkTimeoutAlert, classroomId, activeSchoolId]);

  // Fetch the current user's OWN penalties so we can show the reason banner.
  // Students never see other students' reasons — only teachers/leaders do,
  // through the ClassroomPenaltiesDialog.
  const fetchMyPenalties = useCallback(async () => {
    if (!user?.id || !classroomId) return;
    const { data } = await supabase
      .from('penalties')
      .select('id, reason, infraction_number, penalty_percent, created_at, applied_by')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(10);
    const list = (data ?? []) as any[];
    // Enrich with applied_by name.
    const appliers = Array.from(new Set(list.map((p) => p.applied_by).filter((u): u is string => !!u)));
    let nameMap: Record<string, string> = {};
    if (appliers.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', appliers);
      for (const p of (profs ?? []) as any[]) nameMap[p.user_id] = p.full_name;
    }
    setMyPenalties(list.map((p) => ({ ...p, applied_by_name: p.applied_by ? nameMap[p.applied_by] : null })));
  }, [user?.id, classroomId]);

  useEffect(() => {
    fetchMyPenalties();
    if (!classroomId || !user?.id) return;
    const ch = supabase
      .channel(`student-penalties-${classroomId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'penalties', filter: `user_id=eq.${user.id}` },
        fetchMyPenalties,
      )
      .subscribe();
    const poll = setInterval(fetchMyPenalties, 15000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [fetchMyPenalties, classroomId, user?.id]);

  // Re-render queue when the current user's display preferences change (after ProfileDialog save).
  useEffect(() => {
    fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.name_color, (profile as any)?.display_name_tokens?.join(',')]);

  const onTimerFinished = useCallback(() => {
    setIsInBathroom(false);
    fetchQueue();
  }, [fetchQueue]);
  const { timerSeconds, timerWarning, formattedTime, resetTimer } = useBathroomTimer({
    isInBathroom,
    entryId: myEntry?.id ?? null,
    userId: user?.id ?? null,
    classroomId: classroomId ?? null,
    schoolId: activeSchoolId ?? null,
    onFinished: onTimerFinished,
  });

  const handleJoin = async () => {
    if (!user || !classroomId || !activeSchoolId) return;
    if (!scheduleStatus.open && schedules.length > 0) {
      toast({
        title: 'Fila fechada',
        description: scheduleStatus.next
          ? `Próximo horário: ${scheduleStatus.next.start} – ${scheduleStatus.next.end}`
          : 'Nenhum horário disponível hoje.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    const { error } = await enterQueue(user.id, classroomId, activeSchoolId);
    if (error) {
      toast({
        title: 'Não foi possível entrar na fila',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    }
    await fetchQueue();
    setLoading(false);
  };

  const handleLeave = async () => {
    if (!myEntry || !classroomId || !activeSchoolId) return;
    setLoading(true);
    await leaveQueue(myEntry.id, classroomId, activeSchoolId);
    await fetchQueue();
    setLoading(false);
  };

  const handleGo = async () => {
    if (!myEntry || !user || !classroomId || !activeSchoolId) return;
    setLoading(true);
    await startBathroom(myEntry.id, user.id, classroomId, activeSchoolId);
    setIsInBathroom(true);
    resetTimer();
    await fetchQueue();
    setLoading(false);
  };

  const handleReturn = async () => {
    if (!myEntry || !user || !classroomId || !activeSchoolId) return;
    setLoading(true);
    await finishBathroom(myEntry.id, user.id, classroomId, activeSchoolId, timerSeconds, false);
    setIsInBathroom(false);
    resetTimer();
    await fetchQueue();
    setLoading(false);
  };

  const handleRequestSwap = async () => {
    if (!swapTargetId || !user || !classroomId || !activeSchoolId) return;
    setLoading(true);
    const { error } = await requestSwap(user.id, swapTargetId, classroomId, activeSchoolId);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: 'Solicitação enviada',
        description: 'Aguardando confirmação do colega.',
      });
    }
    setSwapDialogOpen(false);
    setSwapTargetId(null);
    setLoading(false);
  };

  const handleRespondSwap = async (accepted: boolean) => {
    if (!incomingSwap || !classroomId || !activeSchoolId) return;
    setLoading(true);
    await respondToSwap(incomingSwap.id, accepted, classroomId, activeSchoolId);
    toast({
      title: accepted ? 'Troca aceita' : 'Troca recusada',
      description: accepted ? 'Posições trocadas com sucesso.' : 'Você recusou a troca.',
    });
    setIncomingSwapDialogOpen(false);
    setIncomingSwap(null);
    await fetchQueue();
    setLoading(false);
  };

  const isFirst = myEntry && myEntry.position === 1 && myEntry.status === 'waiting';
  const queueOpen = schedules.length === 0 ? true : scheduleStatus.open;
  const joinDisabled =
    loading || !!myEntry || !classroomId || !activeSchoolId || (!queueOpen && schedules.length > 0);
  const iAmLeader = !!(profile as any)?.leader_role;

  // --- Auto-wipe on queue close ---------------------------------------------
  // When the schedule window transitions from OPEN → CLOSED, the queue is
  // considered ended: clear all entries so the next window starts fresh.
  // Guarded by localStorage to avoid multiple connected clients each firing
  // the same DELETE within seconds (idempotent but wasteful).
  useEffect(() => {
    if (!classroomId || schedules.length === 0) return;
    const prev = prevQueueOpenRef.current;
    prevQueueOpenRef.current = queueOpen;
    if (prev === true && queueOpen === false) {
      const key = `educafila:lastClear:${classroomId}`;
      const last = Number(localStorage.getItem(key) || '0');
      if (Date.now() - last > 90_000) {
        localStorage.setItem(key, String(Date.now()));
        clearClassroomQueue(classroomId)
          .then(() => {
            fetchQueue();
          })
          .catch(() => void 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueOpen, classroomId, schedules.length]);
  // -------------------------------------------------------------------------

  const handleLeaderRemove = async (entryId: string) => {
    if (!classroomId || !activeSchoolId) return;
    setLoading(true);
    const { error } = await supabase.from('queue_entries').delete().eq('id', entryId);
    if (error) {
      toast({ title: 'Não foi possível remover', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Aluno removido da fila' });
    }
    await fetchQueue();
    setLoading(false);
  };

  const handleToggleSplit = async () => {
    if (!classroomId) return;
    setLoading(true);
    const { error } = await supabase
      .from('classrooms')
      .update({ split_queue_by_gender: !splitByGender } as any)
      .eq('id', classroomId);
    setLoading(false);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    // Realtime UPDATE will refresh; optimistic local flip:
    setSplitByGender((v) => !v);
  };

  const handleLeaderPenalty = (targetUserId: string, targetName: string) => {
    // Open the reason dialog. The actual apply happens in handlePenaltyConfirmed.
    if (!classroomId || !activeSchoolId) return;
    setPenaltyTarget({ userId: targetUserId, name: targetName });
  };

  const handlePenaltyConfirmed = async (reason: string) => {
    if (!classroomId || !activeSchoolId || !penaltyTarget) return;
    setPenaltySubmitting(true);
    try {
      await applyPenalty(
        penaltyTarget.userId,
        classroomId,
        activeSchoolId,
        reason,
        user?.id,
      );
      toast({
        title: 'Penalidade aplicada',
        description: `${penaltyTarget.name} foi recuado na fila.`,
      });
      setPenaltyTarget(null);
      await fetchQueue();
    } finally {
      setPenaltySubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">EducaFila</h1>
            <p className="text-xs text-muted-foreground truncate max-w-[60vw]">
              {profile?.full_name}
            </p>
          </div>
          <StudentMenu />
        </div>
      </header>

      <main className="container mx-auto max-w-2xl space-y-5 px-4 py-6">
        {/* Banner de penalidades do próprio aluno (apenas ele enxerga) */}
        {(() => {
          const visible = myPenalties.filter((p) => !dismissedPenaltyIds.has(p.id));
          if (visible.length === 0) return null;
          return (
            <Card className="border-warning bg-warning/10" data-testid="my-penalties-banner">
              <CardContent className="space-y-2 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  Você recebeu {visible.length === 1 ? 'uma penalidade' : `${visible.length} penalidades`}
                </div>
                <div className="space-y-2">
                  {visible.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="rounded-md bg-background p-2 text-xs text-foreground"
                      data-testid={`my-penalty-${p.id}`}
                    >
                      <p className="font-semibold">
                        {p.infraction_number}ª infração
                        {p.penalty_percent ? ` · ${p.penalty_percent}% de recuo` : ''}
                      </p>
                      <p className="mt-1">
                        <span className="font-semibold">Motivo: </span>
                        {p.reason || <span className="italic text-muted-foreground">Sem motivo registrado.</span>}
                      </p>
                      {p.applied_by_name && (
                        <p className="mt-0.5 text-muted-foreground">
                          Aplicada por {p.applied_by_name}
                        </p>
                      )}
                      <div className="mt-1 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          data-testid={`dismiss-penalty-${p.id}`}
                          onClick={() => {
                            setDismissedPenaltyIds((prev) => {
                              const next = new Set(prev);
                              next.add(p.id);
                              try {
                                localStorage.setItem(
                                  'educafila:dismissedPenalties',
                                  JSON.stringify(Array.from(next)),
                                );
                              } catch {
                                /* ignore */
                              }
                              return next;
                            });
                          }}
                        >
                          Entendi
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Timer (quando no banheiro) */}
        {isInBathroom && (
          <Card className={`border-2 ${timerWarning ? 'border-destructive' : 'border-primary'}`}>
            <CardContent className="flex flex-col items-center py-8">
              <Clock
                className={`mb-2 h-8 w-8 ${timerWarning ? 'text-destructive animate-pulse-soft' : 'text-primary'}`}
              />
              <p
                className={`text-4xl font-mono font-bold ${
                  timerWarning ? 'text-destructive' : 'text-foreground'
                }`}
                data-testid="bathroom-timer"
              >
                {formattedTime}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {timerWarning ? 'Atenção! Tempo quase esgotado!' : 'Tempo no banheiro'}
              </p>
              <Button
                variant="success"
                size="lg"
                className="mt-4"
                onClick={handleReturn}
                disabled={loading}
                data-testid="return-from-bathroom-btn"
              >
                Registrar Volta
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Card de Horários (mockup) */}
        {!isInBathroom && (
          <Card className="bg-secondary/60 border-0 shadow-none">
            <CardContent className="flex items-start justify-between gap-4 py-5">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold" data-testid="queue-status">
                    {schedules.length === 0
                      ? 'Horários não configurados'
                      : queueOpen
                        ? 'Fila Aberta'
                        : 'Fila Fechada'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {schedules.length === 0
                      ? 'Peça à gestão para cadastrar.'
                      : queueOpen && scheduleStatus.current
                        ? `Agora: ${scheduleStatus.current.start} – ${scheduleStatus.current.end}`
                        : scheduleStatus.next
                          ? `Próximo: ${scheduleStatus.next.start} – ${scheduleStatus.next.end}`
                          : 'Sem próximos horários hoje.'}
                  </p>
                </div>
              </div>
              {scheduleStatus.all.length > 0 && (
                <div className="text-right">
                  <p className="text-sm font-semibold text-muted-foreground">Horários</p>
                  <ul className="mt-1 space-y-0.5 font-mono text-sm tabular-nums text-foreground/80">
                    {scheduleStatus.all.map((s, i) => (
                      <li key={i}>
                        {s.start} – {s.end}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Banner: outro aluno excedeu o tempo */}
        {!isInBathroom && timeoutAlert && (
          <div
            className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3"
            data-testid="timeout-alert-banner"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {timeoutAlert.name} excedeu o tempo (6 min)
              </p>
              <p className="text-xs text-muted-foreground">
                A fila continua normalmente — o próximo pode seguir.
              </p>
            </div>
          </div>
        )}

        {/* Ação primária */}
        {!isInBathroom && !myEntry && (
          <Button
            size="lg"
            onClick={handleJoin}
            disabled={joinDisabled}
            className="w-full rounded-xl bg-[#005F36] py-7 text-lg font-semibold text-white hover:bg-[#00824A] disabled:opacity-50"
            data-testid="enter-queue-btn"
          >
            <LogIn className="mr-2 h-5 w-5" />
            Entrar na Fila
          </Button>
        )}

        {/* Se já na fila */}
        {!isInBathroom && myEntry && (
          <Card>
            <CardContent className="space-y-3 py-5">
              <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Sua posição</p>
                  <p className="text-3xl font-bold text-primary">{myEntry.position}°</p>
                </div>
                <Badge variant={isFirst ? 'default' : 'secondary'}>
                  {isFirst ? 'Sua vez!' : 'Aguardando'}
                </Badge>
              </div>
              {isFirst && (
                <Button
                  onClick={handleGo}
                  disabled={loading}
                  variant="hero"
                  className="w-full"
                  size="lg"
                  data-testid="go-to-bathroom-btn"
                >
                  Ir ao Banheiro
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => setLeaveConfirmOpen(true)}
                  disabled={loading}
                  variant="destructive"
                  className="flex-1"
                  data-testid="leave-queue-btn"
                >
                  <LogOut className="mr-1 h-4 w-4" /> Sair da Fila
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={loading || queue.length < 2}
                  onClick={() => setSwapDialogOpen(true)}
                  data-testid="swap-queue-btn"
                >
                  <ArrowLeftRight className="mr-1 h-4 w-4" /> Trocar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista da fila */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">
              Lista do Banheiro {classroomName ? `— ${classroomName}` : ''}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                ({queue.length} na fila)
              </span>
            </h2>
            {iAmLeader && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPenaltiesListOpen(true)}
                  data-testid="leader-open-penalties-btn"
                  className="gap-1"
                >
                  <Shield className="h-4 w-4" />
                  Penalidades
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleToggleSplit}
                  disabled={loading}
                  data-testid="toggle-split-btn"
                >
                  {splitByGender ? 'Unificar fila' : 'Dividir por gênero'}
                </Button>
              </div>
            )}
          </div>

          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <LogIn className="mb-2 h-10 w-10 opacity-40" />
              <p className="text-base font-semibold text-foreground">A fila está vazia</p>
              <p className="text-sm">Seja o primeiro a entrar!</p>
            </div>
          ) : splitByGender ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="queue-split">
              {(
                [
                  { key: 'feminino', label: 'Feminino', tint: 'bg-pink-50 dark:bg-pink-950/20' },
                  { key: 'masculino', label: 'Masculino', tint: 'bg-blue-50 dark:bg-blue-950/20' },
                ] as const
              ).map((col) => {
                const items = queue.filter((e) =>
                  col.key === 'feminino'
                    ? e.profiles?.gender === 'feminino'
                    : e.profiles?.gender === 'masculino',
                );
                return (
                  <div
                    key={col.key}
                    className={`rounded-lg border p-3 ${col.tint}`}
                    data-testid={`queue-column-${col.key}`}
                  >
                    <h3 className="mb-2 text-sm font-semibold">
                      {col.label}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({items.length})
                      </span>
                    </h3>
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Ninguém ainda.</p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((entry, idx) => (
                          <QueueItemRow
                            key={entry.id}
                            entry={entry}
                            displayPosition={idx + 1}
                            mine={entry.user_id === user?.id}
                            iAmLeader={iAmLeader}
                            loading={loading}
                            onPenalty={handleLeaderPenalty}
                            onRemove={handleLeaderRemove}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Outros sem gênero definido */}
              {(() => {
                const others = queue.filter(
                  (e) =>
                    e.profiles?.gender !== 'feminino' && e.profiles?.gender !== 'masculino',
                );
                if (others.length === 0) return null;
                return (
                  <div className="sm:col-span-2 rounded-lg border bg-muted/40 p-3">
                    <h3 className="mb-2 text-sm font-semibold">Sem gênero definido</h3>
                    <div className="space-y-2">
                      {others.map((entry, idx) => (
                        <QueueItemRow
                          key={entry.id}
                          entry={entry}
                          displayPosition={idx + 1}
                          mine={entry.user_id === user?.id}
                          iAmLeader={iAmLeader}
                          loading={loading}
                          onPenalty={handleLeaderPenalty}
                          onRemove={handleLeaderRemove}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((entry) => (
                <QueueItemRow
                  key={entry.id}
                  entry={entry}
                  displayPosition={entry.position}
                  mine={entry.user_id === user?.id}
                  iAmLeader={iAmLeader}
                  loading={loading}
                  onPenalty={handleLeaderPenalty}
                  onRemove={handleLeaderRemove}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Dialogs de swap */}
      <AlertDialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar de posição</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione o aluno com quem deseja trocar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {queue
              .filter((e) => e.user_id !== user?.id)
              .map((entry) => {
                const { text, color } = renderDisplayName(entry.profiles);
                return (
                  <button
                    key={entry.id}
                    onClick={() => setSwapTargetId(entry.user_id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      swapTargetId === entry.user_id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent'
                    }`}
                    data-testid={`swap-candidate-${entry.position}`}
                  >
                    <span className="text-sm font-medium">
                      {entry.position}° —{' '}
                      <span style={{ color }} className="font-semibold">
                        {text}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSwapTargetId(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRequestSwap}
              disabled={!swapTargetId || loading}
              data-testid="swap-submit-btn"
            >
              Solicitar Troca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={incomingSwapDialogOpen} onOpenChange={setIncomingSwapDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitação de troca</AlertDialogTitle>
            <AlertDialogDescription>
              {incomingSwap?.profiles?.full_name || 'Um colega'} deseja trocar de posição com
              você na fila.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleRespondSwap(false)}>
              <XCircle className="mr-1 h-4 w-4" /> Recusar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRespondSwap(true)}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Aceitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação: sair da fila */}
      <AlertDialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da fila?</AlertDialogTitle>
            <AlertDialogDescription>
              Se você sair agora, perderá sua posição
              {myEntry ? ` (${myEntry.position}° na fila)` : ''} e terá que
              entrar novamente no final. Tem certeza?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="leave-cancel-btn">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setLeaveConfirmOpen(false);
                await handleLeave();
              }}
              data-testid="leave-confirm-btn"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <LogOut className="mr-1 h-4 w-4" />
              Sim, sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: motivo da penalidade (líder/vice) */}
      <PenaltyReasonDialog
        open={!!penaltyTarget}
        onOpenChange={(o) => {
          if (!o) setPenaltyTarget(null);
        }}
        studentName={penaltyTarget?.name || ''}
        onConfirm={handlePenaltyConfirmed}
        submitting={penaltySubmitting}
      />

      {/* Dialog: lista de penalidades da sala (líder/vice) */}
      <ClassroomPenaltiesDialog
        open={penaltiesListOpen}
        onOpenChange={setPenaltiesListOpen}
        classroomId={classroomId || ''}
        classroomName={classroomName}
      />
    </div>
  );
};

/* -----------------------------------------------------------------------
 * QueueItemRow — linha da fila com avatar, nome colorido e ações do líder.
 * Usado tanto na fila unificada quanto nas colunas (Feminino/Masculino).
 * ----------------------------------------------------------------------- */
interface QueueItemRowProps {
  entry: QueueRow & {
    updated_at?: string;
    penalty_count?: number;
  };
  displayPosition: number;
  mine: boolean;
  iAmLeader: boolean;
  loading: boolean;
  onPenalty: (userId: string, name: string) => void;
  onRemove: (entryId: string) => void;
}

const QueueItemRow: React.FC<QueueItemRowProps> = ({
  entry,
  displayPosition,
  mine,
  iAmLeader,
  loading,
  onPenalty,
  onRemove,
}) => {
  const { text: displayName, color: nameColor } = renderDisplayName(entry.profiles);
  const avatarUrl = entry.profiles?.avatar_url;
  const fullName = entry.profiles?.full_name || '';
  const leaderRole = entry.profiles?.leader_role;
  const isInBathroom = entry.status === 'in_bathroom';
  const isPenalized = entry.status === 'penalized';
  const penaltyCount = entry.penalty_count || 0;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border p-3 transition ${
        mine
          ? 'border-primary bg-primary/5'
          : isInBathroom
            ? 'border-warning/40 bg-warning/5'
            : 'border-border bg-card'
      }`}
      data-testid={`queue-row-${entry.position}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            mine ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
          }`}
        >
          {displayPosition}
        </span>
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName || 'Avatar'}
              className="h-full w-full object-cover"
              loading="lazy"
              data-testid={`queue-avatar-${entry.position}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
              {(fullName || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: nameColor }}>
            {displayName}
            {mine && (
              <span className="ml-1 text-[11px] font-normal text-primary">(você)</span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {leaderRole && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
                {LEADER_LABEL[leaderRole]}
              </Badge>
            )}
            {isInBathroom ? (
              <span className="font-medium text-warning">🚻 No banheiro</span>
            ) : isPenalized ? (
              <span className="font-medium text-destructive">Penalizado</span>
            ) : (
              <span>Aguardando</span>
            )}
            {penaltyCount > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {penaltyCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {iAmLeader && !mine && (
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={loading}
            onClick={() => onPenalty(entry.user_id, fullName)}
            title="Aplicar penalidade"
            data-testid={`penalty-btn-${entry.position}`}
          >
            <AlertTriangle className="h-4 w-4 text-warning" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={loading}
            onClick={() => onRemove(entry.id)}
            title="Remover da fila"
            data-testid={`remove-btn-${entry.position}`}
          >
            <XCircle className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
