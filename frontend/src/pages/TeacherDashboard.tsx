import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LogOut,
  AlertTriangle,
  Trash2,
  Clock,
  Users,
  ArrowUp,
  ArrowDown,
  Timer,
  SplitSquareHorizontal,
  Merge,
  Shield,
} from 'lucide-react';
import { applyPenalty, maybeWipeStaleQueue } from '@/lib/queue';
import PenaltyReasonDialog from '@/components/PenaltyReasonDialog';
import ClassroomPenaltiesDialog from '@/components/ClassroomPenaltiesDialog';

type QueueEntry = {
  id: string;
  user_id: string;
  position: number;
  status: string;
  updated_at: string;
  penalty_count?: number;
  profiles?: {
    full_name: string;
    avatar_url: string | null;
    gender: string | null;
  };
};

const TeacherDashboard = () => {
  const { user, profile, signOut, activeSchoolId, setActiveSchoolId } = useAuth();
  const { toast } = useToast();
  const [schools, setSchools] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>('');
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [splitByGender, setSplitByGender] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [penaltyTarget, setPenaltyTarget] = useState<{ userId: string; name: string } | null>(null);
  const [penaltySubmitting, setPenaltySubmitting] = useState(false);
  const [penaltiesListOpen, setPenaltiesListOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchSchools = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('teacher_schools')
        .select('school_id, schools(id, name)')
        .eq('user_id', user.id);
      if (data) {
        const s = data.map((d: any) => d.schools).filter(Boolean);
        setSchools(s);
        if (s.length === 1) setActiveSchoolId(s[0].id);
      }
    };
    fetchSchools();
  }, [user]);

  useEffect(() => {
    if (!activeSchoolId) return;
    supabase
      .from('classrooms')
      .select('*')
      .eq('school_id', activeSchoolId)
      .order('name')
      .then(({ data }) => {
        if (data) setClassrooms(data);
      });
  }, [activeSchoolId]);

  // Load split state for the selected classroom.
  const fetchClassroomSettings = useCallback(async () => {
    if (!selectedClassroom) return;
    const { data } = await supabase
      .from('classrooms')
      .select('split_queue_by_gender')
      .eq('id', selectedClassroom)
      .maybeSingle();
    if (data) setSplitByGender(!!(data as any).split_queue_by_gender);
  }, [selectedClassroom]);

  const fetchQueue = useCallback(async () => {
    if (!selectedClassroom) return;
    const { data: rows } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('classroom_id', selectedClassroom)
      .order('position', { ascending: true });
    const entries = (rows ?? []) as any[];
    const ids = Array.from(new Set(entries.map((e) => e.user_id)));
    let profMap: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url, gender')
        .in('user_id', ids);
      for (const p of (profs ?? []) as any[]) profMap[p.user_id] = p;
    }
    setQueue(entries.map((e) => ({ ...e, profiles: profMap[e.user_id] })));
  }, [selectedClassroom]);

  useEffect(() => {
    fetchClassroomSettings();
    fetchQueue();
    if (!selectedClassroom) return;
    const channel = supabase
      .channel(`teacher-queue-${selectedClassroom}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `classroom_id=eq.${selectedClassroom}`,
        },
        fetchQueue,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'classrooms',
          filter: `id=eq.${selectedClassroom}`,
        },
        fetchClassroomSettings,
      )
      .subscribe();
    // Polling fallback — keeps UI fresh even if realtime publication is off.
    const poll = setInterval(() => {
      fetchQueue();
    }, 8000);
    // Periodic stale-queue check: if the schedule closed while nobody was
    // online (or between polling ticks), any teacher logged in will wipe
    // the classroom's queue within at most 1 minute.
    const staleCheck = setInterval(() => {
      if (selectedClassroom && activeSchoolId) {
        maybeWipeStaleQueue(selectedClassroom, activeSchoolId).then((wiped) => {
          if (wiped) fetchQueue();
        });
      }
    }, 60_000);
    // Also run once immediately on mount / classroom change.
    if (selectedClassroom && activeSchoolId) {
      maybeWipeStaleQueue(selectedClassroom, activeSchoolId).then((wiped) => {
        if (wiped) fetchQueue();
      });
    }
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(staleCheck);
    };
  }, [fetchQueue, fetchClassroomSettings, selectedClassroom, activeSchoolId]);

  const removeFromQueue = async (entryId: string) => {
    await supabase.from('queue_entries').delete().eq('id', entryId);
    toast({ title: 'Aluno removido da fila' });
    fetchQueue();
  };

  const handleApplyPenalty = (userId: string, userName: string) => {
    // Open the reason dialog. Actual apply happens in handlePenaltyConfirmed.
    setPenaltyTarget({ userId, name: userName });
  };

  const handlePenaltyConfirmed = async (reason: string) => {
    if (!activeSchoolId || !selectedClassroom || !penaltyTarget) return;
    setPenaltySubmitting(true);
    try {
      await applyPenalty(
        penaltyTarget.userId,
        selectedClassroom,
        activeSchoolId,
        reason,
        user?.id,
      );
      toast({
        title: 'Penalidade aplicada',
        description: `${penaltyTarget.name} foi recuado na fila.`,
      });
      setPenaltyTarget(null);
      fetchQueue();
    } finally {
      setPenaltySubmitting(false);
    }
  };

  const movePosition = async (entryId: string, direction: 'up' | 'down') => {
    const idx = queue.findIndex((e) => e.id === entryId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= queue.length) return;
    await Promise.all([
      supabase
        .from('queue_entries')
        .update({ position: queue[swapIdx].position })
        .eq('id', queue[idx].id),
      supabase
        .from('queue_entries')
        .update({ position: queue[idx].position })
        .eq('id', queue[swapIdx].id),
    ]);
    fetchQueue();
  };

  const handleToggleSplit = async () => {
    if (!selectedClassroom) return;
    setToggling(true);
    const { error } = await supabase
      .from('classrooms')
      .update({ split_queue_by_gender: !splitByGender } as any)
      .eq('id', selectedClassroom);
    setToggling(false);
    if (error) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setSplitByGender((v) => !v);
    toast({
      title: !splitByGender ? 'Fila dividida por gênero' : 'Fila unificada',
      description: !splitByGender
        ? 'Os alunos verão duas colunas: Feminino e Masculino.'
        : 'Os alunos voltam a ver a fila única.',
    });
  };

  const getBathroomSeconds = (entry: QueueEntry): number | null => {
    if (entry.status !== 'in_bathroom') return null;
    return Math.floor((now - new Date(entry.updated_at).getTime()) / 1000);
  };
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  const inBathroom = queue.filter((e) => e.status === 'in_bathroom');
  const exceededStudents = inBathroom.filter((e) => {
    const sec = getBathroomSeconds(e);
    return sec !== null && sec > 360;
  });
  const avgTime = useMemo(() => {
    const times = inBathroom
      .map((e) => getBathroomSeconds(e))
      .filter((t): t is number => t !== null);
    if (times.length === 0) return 0;
    return Math.floor(times.reduce((a, b) => a + b, 0) / times.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inBathroom, now]);

  const renderRow = (entry: QueueEntry, idx: number, total: number) => {
    const bathroomSec = getBathroomSeconds(entry);
    const exceeded = bathroomSec !== null && bathroomSec > 360;
    const fullName = entry.profiles?.full_name || '';
    const avatarUrl = entry.profiles?.avatar_url;
    return (
      <div
        key={entry.id}
        className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
          exceeded
            ? 'border-destructive bg-destructive/5'
            : entry.status === 'in_bathroom'
              ? 'border-warning bg-warning/5'
              : 'border-border'
        }`}
        data-testid={`teacher-queue-row-${entry.position}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              exceeded ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'
            }`}
          >
            {entry.position}
          </span>
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {(fullName || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {fullName}
              {(entry.penalty_count || 0) > 0 && (
                <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {entry.penalty_count}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {entry.status === 'in_bathroom' ? (
                <span className={exceeded ? 'font-semibold text-destructive' : 'text-warning'}>
                  🚻 {formatTime(bathroomSec!)}
                </span>
              ) : (
                'Aguardando'
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => movePosition(entry.id, 'up')}
            disabled={idx === 0}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => movePosition(entry.id, 'down')}
            disabled={idx === total - 1}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleApplyPenalty(entry.user_id, fullName)}
          >
            <AlertTriangle className="h-4 w-4 text-warning" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => removeFromQueue(entry.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  // Prepare split groups when enabled.
  const femaleQueue = queue.filter((e) => e.profiles?.gender === 'feminino');
  const maleQueue = queue.filter((e) => e.profiles?.gender === 'masculino');
  const otherQueue = queue.filter(
    (e) => e.profiles?.gender !== 'feminino' && e.profiles?.gender !== 'masculino',
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">EducaFila · Professor</h1>
            <p className="text-xs text-muted-foreground">{profile?.full_name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>
      <main className="container mx-auto space-y-6 px-4 py-6">
        {schools.length > 1 && (
          <Card>
            <CardContent className="py-4">
              <Select value={activeSchoolId || ''} onValueChange={setActiveSchoolId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a escola" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}
        {activeSchoolId && (
          <Card>
            <CardContent className="py-4">
              <Select value={selectedClassroom} onValueChange={setSelectedClassroom}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a sala" />
                </SelectTrigger>
                <SelectContent>
                  {classrooms.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}
        {selectedClassroom && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="py-3 text-center">
                  <Users className="mx-auto mb-1 h-5 w-5 text-primary" />
                  <p className="text-2xl font-bold text-foreground">{queue.length}</p>
                  <p className="text-xs text-muted-foreground">Na fila</p>
                </CardContent>
              </Card>
              <Card className={inBathroom.length > 0 ? 'border-warning' : ''}>
                <CardContent className="py-3 text-center">
                  <Clock className="mx-auto mb-1 h-5 w-5 text-warning" />
                  <p className="text-2xl font-bold text-foreground">{inBathroom.length}</p>
                  <p className="text-xs text-muted-foreground">No banheiro</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-3 text-center">
                  <Timer className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
                  <p className="text-2xl font-bold text-foreground">
                    {avgTime > 0 ? formatTime(avgTime) : '--'}
                  </p>
                  <p className="text-xs text-muted-foreground">Tempo médio</p>
                </CardContent>
              </Card>
            </div>
            {exceededStudents.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3"
              >
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  {entry.profiles?.full_name} — {formatTime(getBathroomSeconds(entry)!)} (excedeu
                  6 min)
                </span>
              </div>
            ))}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Fila da Sala</CardTitle>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPenaltiesListOpen(true)}
                    data-testid="teacher-open-penalties-btn"
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
                    disabled={toggling}
                    data-testid="teacher-toggle-split-btn"
                    className="gap-1"
                  >
                    {splitByGender ? (
                      <>
                        <Merge className="h-4 w-4" />
                        Unificar fila
                      </>
                    ) : (
                      <>
                        <SplitSquareHorizontal className="h-4 w-4" />
                        Dividir por gênero
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {queue.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Fila vazia</p>
                ) : splitByGender ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="teacher-queue-split">
                      <div
                        className="rounded-lg border bg-pink-50 p-3 dark:bg-pink-950/20"
                        data-testid="teacher-queue-column-feminino"
                      >
                        <h3 className="mb-2 text-sm font-semibold">
                          Feminino{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({femaleQueue.length})
                          </span>
                        </h3>
                        {femaleQueue.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Ninguém ainda.</p>
                        ) : (
                          <div className="space-y-2">
                            {femaleQueue.map((e, i) => renderRow(e, i, femaleQueue.length))}
                          </div>
                        )}
                      </div>
                      <div
                        className="rounded-lg border bg-blue-50 p-3 dark:bg-blue-950/20"
                        data-testid="teacher-queue-column-masculino"
                      >
                        <h3 className="mb-2 text-sm font-semibold">
                          Masculino{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({maleQueue.length})
                          </span>
                        </h3>
                        {maleQueue.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Ninguém ainda.</p>
                        ) : (
                          <div className="space-y-2">
                            {maleQueue.map((e, i) => renderRow(e, i, maleQueue.length))}
                          </div>
                        )}
                      </div>
                    </div>
                    {otherQueue.length > 0 && (
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <h3 className="mb-2 text-sm font-semibold">
                          Sem gênero definido{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({otherQueue.length})
                          </span>
                        </h3>
                        <div className="space-y-2">
                          {otherQueue.map((e, i) => renderRow(e, i, otherQueue.length))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {queue.map((entry, idx) => renderRow(entry, idx, queue.length))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Dialog: motivo da penalidade */}
      <PenaltyReasonDialog
        open={!!penaltyTarget}
        onOpenChange={(o) => {
          if (!o) setPenaltyTarget(null);
        }}
        studentName={penaltyTarget?.name || ''}
        onConfirm={handlePenaltyConfirmed}
        submitting={penaltySubmitting}
      />

      {/* Dialog: lista de penalidades da sala */}
      <ClassroomPenaltiesDialog
        open={penaltiesListOpen}
        onOpenChange={setPenaltiesListOpen}
        classroomId={selectedClassroom}
        classroomName={
          classrooms.find((c: any) => c.id === selectedClassroom)?.name
        }
      />
    </div>
  );
};

export default TeacherDashboard;
