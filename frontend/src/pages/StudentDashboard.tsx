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
} from '@/lib/queue';
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
    const ch = supabase
      .channel('student-queue-realtime')
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
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchClassroom, fetchQueue, fetchIncomingSwaps, loadSchedules, checkTimeoutAlert, classroomId]);

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
                  onClick={handleLeave}
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
          <h2 className="mb-3 text-xl font-bold">
            Lista do Banheiro {classroomName ? `— ${classroomName}` : ''}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({queue.length} na fila)
            </span>
          </h2>
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <LogIn className="mb-2 h-10 w-10 opacity-40" />
              <p className="text-base font-semibold text-foreground">A fila está vazia</p>
              <p className="text-sm">Seja o primeiro a entrar!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((entry) => {
                const { text, color } = renderDisplayName(entry.profiles);
                const penalties = entry.penalty_count || 0;
                const leaderRole = entry.profiles?.leader_role ?? null;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      entry.user_id === user?.id ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    data-testid={`queue-item-${entry.position}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {entry.position}
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold" style={{ color }}>
                          {text}
                        </span>
                        {leaderRole && (
                          <span
                            className="rounded-full bg-[#F37021]/10 px-2 py-0.5 text-xs font-semibold text-[#F37021]"
                            data-testid={`leader-badge-${entry.position}`}
                          >
                            {LEADER_LABEL[leaderRole]}
                          </span>
                        )}
                        {penalties > 0 && (
                          <span
                            className="flex items-center gap-0.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                            title={`${penalties} penalidade(s)`}
                            data-testid={`penalty-badge-${entry.position}`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {penalties}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={
                          entry.status === 'in_bathroom'
                            ? 'destructive'
                            : entry.status === 'returned'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {entry.status === 'in_bathroom'
                          ? 'No banheiro'
                          : entry.status === 'returned'
                            ? 'Voltou'
                            : 'Aguardando'}
                      </Badge>
                      {iAmLeader && entry.user_id !== user?.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleLeaderPenalty(entry.user_id, text)}
                            disabled={loading}
                            className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent"
                            title="Aplicar penalidade"
                            aria-label="Aplicar penalidade"
                            data-testid={`leader-penalty-btn-${entry.position}`}
                          >
                            <AlertTriangle className="h-4 w-4 text-warning" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLeaderRemove(entry.id)}
                            disabled={loading}
                            className="flex h-8 w-8 items-center justify-center rounded hover:bg-accent"
                            title="Remover da fila"
                            aria-label="Remover da fila"
                            data-testid={`leader-remove-btn-${entry.position}`}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
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
    </div>
  );
};

export default StudentDashboard;
