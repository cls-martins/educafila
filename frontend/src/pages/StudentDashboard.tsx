import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useBathroomTimer } from '@/hooks/useBathroomTimer';
import { enterQueue, leaveQueue, startBathroom, finishBathroom, requestSwap, respondToSwap } from '@/lib/queue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { LogIn, LogOut, Clock, User, ArrowLeftRight } from 'lucide-react';

const StudentDashboard = () => {
  const { user, profile, signOut, activeSchoolId } = useAuth();
  const { toast } = useToast();
  const [queue, setQueue] = useState<any[]>([]);
  const [myEntry, setMyEntry] = useState<any>(null);
  const [isInBathroom, setIsInBathroom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [incomingSwap, setIncomingSwap] = useState<any>(null);
  const [incomingSwapDialogOpen, setIncomingSwapDialogOpen] = useState(false);
  const classroomId = profile?.classroom_id;

  const fetchQueue = useCallback(async () => {
    if (!classroomId || !activeSchoolId) return;
    const { data } = await supabase.from('queue_entries').select('*, profiles(full_name, avatar_url)').eq('classroom_id', classroomId).eq('school_id', activeSchoolId).order('position', { ascending: true });
    if (data) { setQueue(data); const mine = data.find((e: any) => e.user_id === user?.id); setMyEntry(mine || null); setIsInBathroom(mine?.status === 'in_bathroom'); }
  }, [classroomId, activeSchoolId, user?.id]);

  const fetchIncomingSwaps = useCallback(async () => {
    if (!user?.id || !classroomId || !activeSchoolId) return;
    const { data } = await supabase.from('swap_requests').select('*, profiles!swap_requests_requester_id_fkey(full_name)').eq('target_id', user.id).eq('classroom_id', classroomId).eq('status', 'pending').limit(1);
    if (data && data.length > 0) { setIncomingSwap(data[0]); setIncomingSwapDialogOpen(true); }
  }, [user?.id, classroomId, activeSchoolId]);

  useEffect(() => {
    fetchQueue(); fetchIncomingSwaps();
    if (!classroomId) return;
    const channel = supabase.channel('queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter: `classroom_id=eq.${classroomId}` }, fetchQueue)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'swap_requests', filter: `classroom_id=eq.${classroomId}` }, fetchIncomingSwaps)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchQueue, fetchIncomingSwaps, classroomId]);

  const onTimerFinished = useCallback(() => { setIsInBathroom(false); fetchQueue(); }, [fetchQueue]);
  const { timerSeconds, timerWarning, formattedTime, resetTimer } = useBathroomTimer({ isInBathroom, entryId: myEntry?.id ?? null, userId: user?.id ?? null, classroomId: classroomId ?? null, schoolId: activeSchoolId ?? null, onFinished: onTimerFinished });

  const handleJoinQueue = async () => { if (!user || !classroomId || !activeSchoolId) return; setLoading(true); await enterQueue(user.id, classroomId, activeSchoolId); await fetchQueue(); setLoading(false); };
  const handleLeaveQueue = async () => { if (!myEntry || !classroomId || !activeSchoolId) return; setLoading(true); await leaveQueue(myEntry.id, classroomId, activeSchoolId); await fetchQueue(); setLoading(false); };
  const handleGoToBathroom = async () => { if (!myEntry || !user || !classroomId || !activeSchoolId) return; setLoading(true); await startBathroom(myEntry.id, user.id, classroomId, activeSchoolId); setIsInBathroom(true); resetTimer(); await fetchQueue(); setLoading(false); };
  const handleReturnFromBathroom = async () => { if (!myEntry || !user || !classroomId || !activeSchoolId) return; setLoading(true); await finishBathroom(myEntry.id, user.id, classroomId, activeSchoolId, timerSeconds, false); setIsInBathroom(false); resetTimer(); await fetchQueue(); setLoading(false); };
  const handleRequestSwap = async () => { if (!swapTargetId || !user || !classroomId || !activeSchoolId) return; setLoading(true); await requestSwap(user.id, swapTargetId, classroomId, activeSchoolId); toast({ title: 'Solicitação enviada', description: 'Aguardando confirmação do outro aluno.' }); setSwapDialogOpen(false); setSwapTargetId(null); setLoading(false); };
  const handleRespondSwap = async (accepted: boolean) => { if (!incomingSwap || !classroomId || !activeSchoolId) return; setLoading(true); await respondToSwap(incomingSwap.id, accepted, classroomId, activeSchoolId); toast({ title: accepted ? 'Troca aceita' : 'Troca recusada', description: accepted ? 'Posições trocadas com sucesso.' : 'Você recusou a troca.' }); setIncomingSwapDialogOpen(false); setIncomingSwap(null); await fetchQueue(); setLoading(false); };
  const isFirstInQueue = myEntry && myEntry.position === 1 && myEntry.status === 'waiting';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div><h1 className="text-lg font-bold text-foreground">EducaFila</h1><p className="text-xs text-muted-foreground">{profile?.full_name}</p></div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Sair</Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 space-y-6">
        {isInBathroom && (
          <Card className={`border-2 ${timerWarning ? 'border-destructive' : 'border-primary'}`}>
            <CardContent className="flex flex-col items-center py-8">
              <Clock className={`mb-2 h-8 w-8 ${timerWarning ? 'text-destructive animate-pulse-soft' : 'text-primary'}`} />
              <p className={`text-4xl font-mono font-bold ${timerWarning ? 'text-destructive' : 'text-foreground'}`}>{formattedTime}</p>
              <p className="mt-1 text-sm text-muted-foreground">{timerWarning ? 'Atenção! Tempo quase esgotado!' : 'Tempo no banheiro'}</p>
              <Button variant="success" size="lg" className="mt-4" onClick={handleReturnFromBathroom} disabled={loading}>Registrar Volta</Button>
            </CardContent>
          </Card>
        )}
        {!isInBathroom && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" />Fila do Banheiro</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!myEntry ? (
                <Button onClick={handleJoinQueue} disabled={loading} className="w-full" size="lg"><LogIn className="mr-2 h-4 w-4" /> Entrar na Fila</Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
                    <div><p className="text-sm text-muted-foreground">Sua posição</p><p className="text-3xl font-bold text-primary">{myEntry.position}°</p></div>
                    <Badge variant={isFirstInQueue ? 'default' : 'secondary'}>{isFirstInQueue ? 'Sua vez!' : 'Aguardando'}</Badge>
                  </div>
                  {isFirstInQueue && <Button onClick={handleGoToBathroom} disabled={loading} variant="hero" className="w-full" size="lg">🚻 Ir ao Banheiro</Button>}
                  <div className="flex gap-2">
                    <Button onClick={handleLeaveQueue} disabled={loading} variant="destructive" className="flex-1"><LogOut className="mr-1 h-4 w-4" /> Sair da Fila</Button>
                    <Button variant="outline" className="flex-1" disabled={loading || queue.length < 2 || !myEntry} onClick={() => setSwapDialogOpen(true)}><ArrowLeftRight className="mr-1 h-4 w-4" /> Trocar</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="text-base">Fila Atual ({queue.length})</CardTitle></CardHeader>
          <CardContent>
            {queue.length === 0 ? <p className="text-center text-sm text-muted-foreground py-4">Fila vazia</p> : (
              <div className="space-y-2">
                {queue.map((entry: any) => (
                  <div key={entry.id} className={`flex items-center justify-between rounded-lg border p-3 ${entry.user_id === user?.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{entry.position}</span>
                      <span className="text-sm font-medium text-foreground">{(entry.profiles as any)?.full_name || 'Aluno'}</span>
                    </div>
                    <Badge variant={entry.status === 'in_bathroom' ? 'destructive' : entry.status === 'returned' ? 'default' : 'secondary'}>
                      {entry.status === 'in_bathroom' ? '🚻 No banheiro' : entry.status === 'returned' ? 'Voltou' : 'Aguardando'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <AlertDialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Trocar de posição</AlertDialogTitle><AlertDialogDescription>Selecione o aluno com quem deseja trocar.</AlertDialogDescription></AlertDialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {queue.filter((e) => e.user_id !== user?.id).map((entry) => (
              <button key={entry.id} onClick={() => setSwapTargetId(entry.user_id)} className={`w-full text-left rounded-lg border p-3 transition-colors ${swapTargetId === entry.user_id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}`}>
                <span className="text-sm font-medium">{entry.position}° — {(entry.profiles as any)?.full_name || 'Aluno'}</span>
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSwapTargetId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRequestSwap} disabled={!swapTargetId || loading}>Solicitar Troca</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={incomingSwapDialogOpen} onOpenChange={setIncomingSwapDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Solicitação de troca</AlertDialogTitle><AlertDialogDescription>Um colega deseja trocar de posição com você na fila.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleRespondSwap(false)}>Recusar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleRespondSwap(true)}>Aceitar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StudentDashboard;
