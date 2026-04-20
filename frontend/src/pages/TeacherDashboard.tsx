import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, AlertTriangle, Trash2, Clock, Users, ArrowUp, ArrowDown, Timer } from 'lucide-react';
import { applyPenalty } from '@/lib/queue';

const TeacherDashboard = () => {
  const { user, profile, signOut, activeSchoolId, setActiveSchoolId } = useAuth();
  const { toast } = useToast();
  const [schools, setSchools] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>('');
  const [queue, setQueue] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);

  useEffect(() => {
    const fetchSchools = async () => {
      if (!user) return;
      const { data } = await supabase.from('teacher_schools').select('school_id, schools(id, name)').eq('user_id', user.id);
      if (data) { const s = data.map((d: any) => d.schools).filter(Boolean); setSchools(s); if (s.length === 1) setActiveSchoolId(s[0].id); }
    };
    fetchSchools();
  }, [user]);

  useEffect(() => {
    if (!activeSchoolId) return;
    supabase.from('classrooms').select('*').eq('school_id', activeSchoolId).order('name').then(({ data }) => { if (data) setClassrooms(data); });
  }, [activeSchoolId]);

  const fetchQueue = useCallback(async () => {
    if (!selectedClassroom) return;
    const { data } = await supabase.from('queue_entries').select('*, profiles(full_name, avatar_url, gender)').eq('classroom_id', selectedClassroom).order('position', { ascending: true });
    if (data) setQueue(data);
  }, [selectedClassroom]);

  useEffect(() => {
    fetchQueue();
    if (!selectedClassroom) return;
    const channel = supabase.channel('teacher-queue').on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter: `classroom_id=eq.${selectedClassroom}` }, fetchQueue).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchQueue, selectedClassroom]);

  const removeFromQueue = async (entryId: string) => { await supabase.from('queue_entries').delete().eq('id', entryId); toast({ title: 'Aluno removido da fila' }); fetchQueue(); };

  const handleApplyPenalty = async (userId: string, userName: string) => {
    if (!activeSchoolId || !selectedClassroom) return;
    await applyPenalty(userId, selectedClassroom, activeSchoolId, 'Penalidade aplicada pelo professor');
    toast({ title: 'Penalidade aplicada', description: `${userName} foi recuado na fila.` });
    fetchQueue();
  };

  const movePosition = async (entryId: string, direction: 'up' | 'down') => {
    const idx = queue.findIndex((e: any) => e.id === entryId); if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1; if (swapIdx < 0 || swapIdx >= queue.length) return;
    await Promise.all([supabase.from('queue_entries').update({ position: queue[swapIdx].position }).eq('id', queue[idx].id), supabase.from('queue_entries').update({ position: queue[idx].position }).eq('id', queue[swapIdx].id)]);
    fetchQueue();
  };

  const getBathroomSeconds = (entry: any): number | null => { if (entry.status !== 'in_bathroom') return null; return Math.floor((now - new Date(entry.updated_at).getTime()) / 1000); };
  const formatTime = (seconds: number) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${s.toString().padStart(2, '0')}`; };
  const inBathroom = queue.filter((e: any) => e.status === 'in_bathroom');
  const exceededStudents = inBathroom.filter((e: any) => { const sec = getBathroomSeconds(e); return sec !== null && sec > 360; });
  const avgTime = useMemo(() => { const times = inBathroom.map((e: any) => getBathroomSeconds(e)).filter((t): t is number => t !== null); if (times.length === 0) return 0; return Math.floor(times.reduce((a, b) => a + b, 0) / times.length); }, [inBathroom, now]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div><h1 className="text-lg font-bold text-foreground">EducaFila · Professor</h1><p className="text-xs text-muted-foreground">{profile?.full_name}</p></div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Sair</Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 space-y-6">
        {schools.length > 1 && (<Card><CardContent className="py-4"><Select value={activeSchoolId || ''} onValueChange={setActiveSchoolId}><SelectTrigger><SelectValue placeholder="Selecione a escola" /></SelectTrigger><SelectContent>{schools.map((s: any) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent></Select></CardContent></Card>)}
        {activeSchoolId && (<Card><CardContent className="py-4"><Select value={selectedClassroom} onValueChange={setSelectedClassroom}><SelectTrigger><SelectValue placeholder="Selecione a sala" /></SelectTrigger><SelectContent>{classrooms.map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}</SelectContent></Select></CardContent></Card>)}
        {selectedClassroom && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="py-3 text-center"><Users className="mx-auto h-5 w-5 text-primary mb-1" /><p className="text-2xl font-bold text-foreground">{queue.length}</p><p className="text-xs text-muted-foreground">Na fila</p></CardContent></Card>
              <Card className={inBathroom.length > 0 ? 'border-warning' : ''}><CardContent className="py-3 text-center"><Clock className="mx-auto h-5 w-5 text-warning mb-1" /><p className="text-2xl font-bold text-foreground">{inBathroom.length}</p><p className="text-xs text-muted-foreground">No banheiro</p></CardContent></Card>
              <Card><CardContent className="py-3 text-center"><Timer className="mx-auto h-5 w-5 text-muted-foreground mb-1" /><p className="text-2xl font-bold text-foreground">{avgTime > 0 ? formatTime(avgTime) : '--'}</p><p className="text-xs text-muted-foreground">Tempo médio</p></CardContent></Card>
            </div>
            {exceededStudents.map((entry: any) => (<div key={entry.id} className="flex items-center gap-2 rounded-lg border border-destructive bg-destructive/10 p-3"><AlertTriangle className="h-5 w-5 text-destructive" /><span className="text-sm font-medium text-destructive">{(entry.profiles as any)?.full_name} — {formatTime(getBathroomSeconds(entry)!)} (excedeu 6 min)</span></div>))}
            <Card>
              <CardHeader><CardTitle className="text-base">Fila da Sala</CardTitle></CardHeader>
              <CardContent>
                {queue.length === 0 ? <p className="text-center text-sm text-muted-foreground py-4">Fila vazia</p> : (
                  <div className="space-y-2">
                    {queue.map((entry: any, idx: number) => {
                      const bathroomSec = getBathroomSeconds(entry); const exceeded = bathroomSec !== null && bathroomSec > 360;
                      return (
                        <div key={entry.id} className={`flex items-center justify-between rounded-lg border p-3 ${exceeded ? 'border-destructive bg-destructive/5' : entry.status === 'in_bathroom' ? 'border-warning bg-warning/5' : 'border-border'}`}>
                          <div className="flex items-center gap-3">
                            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${exceeded ? 'bg-destructive/20 text-destructive' : 'bg-primary/10 text-primary'}`}>{entry.position}</span>
                            <div>
                              <p className="text-sm font-medium text-foreground">{(entry.profiles as any)?.full_name}{entry.penalty_count > 0 && (<span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"><AlertTriangle className="h-3 w-3" />{entry.penalty_count}</span>)}</p>
                              <p className="text-xs text-muted-foreground">{entry.status === 'in_bathroom' ? <span className={exceeded ? 'text-destructive font-semibold' : 'text-warning'}>🚻 {formatTime(bathroomSec!)}</span> : 'Aguardando'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => movePosition(entry.id, 'up')} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => movePosition(entry.id, 'down')} disabled={idx === queue.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleApplyPenalty(entry.user_id, (entry.profiles as any)?.full_name)}><AlertTriangle className="h-4 w-4 text-warning" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFromQueue(entry.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default TeacherDashboard;
