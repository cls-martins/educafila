import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { leaveQueue, applyPenalty } from '@/lib/queue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Clock, LogOut, Users, ArrowUp, ArrowDown, Trash2, ShieldAlert } from 'lucide-react';

interface ClassroomInfo { id: string; name: string; year: number; }
interface QueueEntryWithProfile { id: string; user_id: string; position: number; status: string; joined_at: string; classroom_id: string; school_id: string; profiles: { full_name: string; avatar_url: string | null } | null; }
interface BathroomAlert { user_id: string; full_name: string; classroom_name: string; classroom_id: string; start_time: string; minutes_elapsed: number; }
interface PenaltyAlert { user_id: string; full_name: string; classroom_name: string; penalty_count: number; }

const CoordinatorDashboard: React.FC = () => {
  const { profile, signOut, activeSchoolId } = useAuth();
  const { toast } = useToast();
  const [classrooms, setClassrooms] = useState<ClassroomInfo[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueEntryWithProfile[]>([]);
  const [bathroomAlerts, setBathroomAlerts] = useState<BathroomAlert[]>([]);
  const [penaltyAlerts, setPenaltyAlerts] = useState<PenaltyAlert[]>([]);
  const [penaltyDialog, setPenaltyDialog] = useState<{ userId: string; userName: string } | null>(null);
  const [penaltyReason, setPenaltyReason] = useState('');

  useEffect(() => { if (!activeSchoolId) return; supabase.from('classrooms').select('id, name, year').eq('school_id', activeSchoolId).order('year').order('name').then(({ data }) => { if (data) setClassrooms(data); }); }, [activeSchoolId]);

  const fetchQueue = useCallback(async () => {
    if (!selectedClassroom || !activeSchoolId) { setQueue([]); return; }
    const { data: entries } = await supabase.from('queue_entries').select('id, user_id, position, status, joined_at, classroom_id, school_id').eq('classroom_id', selectedClassroom).eq('school_id', activeSchoolId).order('position', { ascending: true });
    if (!entries || entries.length === 0) { setQueue([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', entries.map(e => e.user_id));
    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));
    setQueue(entries.map(e => ({ ...e, profiles: profileMap.get(e.user_id) ? { full_name: profileMap.get(e.user_id)!.full_name, avatar_url: profileMap.get(e.user_id)!.avatar_url } : null })));
  }, [selectedClassroom, activeSchoolId]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useEffect(() => { if (!selectedClassroom) return; const ch = supabase.channel(`coord-q-${selectedClassroom}`).on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter: `classroom_id=eq.${selectedClassroom}` }, () => fetchQueue()).subscribe(); return () => { supabase.removeChannel(ch); }; }, [selectedClassroom, fetchQueue]);

  const checkAlerts = useCallback(async () => {
    if (!activeSchoolId) return;
    const { data: logs } = await supabase.from('bathroom_logs').select('user_id, start_time, classroom_id').eq('school_id', activeSchoolId).is('end_time', null).lt('start_time', new Date(Date.now() - 6 * 60 * 1000).toISOString());
    if (!logs || logs.length === 0) { setBathroomAlerts([]); return; }
    const [pr, cr] = await Promise.all([supabase.from('profiles').select('user_id, full_name').in('user_id', [...new Set(logs.map(l => l.user_id))]), supabase.from('classrooms').select('id, name').in('id', [...new Set(logs.map(l => l.classroom_id))])]);
    const pm = new Map((pr.data ?? []).map(p => [p.user_id, p.full_name])); const cm = new Map((cr.data ?? []).map(c => [c.id, c.name]));
    setBathroomAlerts(logs.map(l => ({ user_id: l.user_id, full_name: pm.get(l.user_id) ?? '?', classroom_name: cm.get(l.classroom_id) ?? '', classroom_id: l.classroom_id, start_time: l.start_time, minutes_elapsed: Math.floor((Date.now() - new Date(l.start_time).getTime()) / 60000) })));
  }, [activeSchoolId]);

  const checkPenaltyAlerts = useCallback(async () => {
    if (!activeSchoolId) return;
    const { data } = await supabase.from('penalties').select('user_id').eq('school_id', activeSchoolId);
    if (!data || data.length === 0) { setPenaltyAlerts([]); return; }
    const cm = new Map<string, number>(); data.forEach(p => cm.set(p.user_id, (cm.get(p.user_id) ?? 0) + 1));
    const rep = [...cm.entries()].filter(([, c]) => c >= 2); if (rep.length === 0) { setPenaltyAlerts([]); return; }
    const { data: profs } = await supabase.from('profiles').select('user_id, full_name, classroom_id').in('user_id', rep.map(([id]) => id));
    const cIds = [...new Set((profs ?? []).map(p => p.classroom_id).filter(Boolean))] as string[];
    const { data: cls } = cIds.length ? await supabase.from('classrooms').select('id, name').in('id', cIds) : { data: [] };
    const clm = new Map((cls ?? []).map(c => [c.id, c.name]));
    setPenaltyAlerts(rep.map(([uid, cnt]) => { const p = (profs ?? []).find(pr => pr.user_id === uid); return { user_id: uid, full_name: p?.full_name ?? '?', classroom_name: p?.classroom_id ? clm.get(p.classroom_id) ?? '' : '', penalty_count: cnt }; }));
  }, [activeSchoolId]);

  useEffect(() => { checkAlerts(); checkPenaltyAlerts(); const i = setInterval(() => { checkAlerts(); checkPenaltyAlerts(); }, 30000); return () => clearInterval(i); }, [checkAlerts, checkPenaltyAlerts]);
  useEffect(() => { if (!activeSchoolId) return; const ch = supabase.channel('coord-bath').on('postgres_changes', { event: '*', schema: 'public', table: 'bathroom_logs' }, () => checkAlerts()).subscribe(); return () => { supabase.removeChannel(ch); }; }, [activeSchoolId, checkAlerts]);

  const handleRemoveFromQueue = async (entry: QueueEntryWithProfile) => { await leaveQueue(entry.id, entry.classroom_id, entry.school_id); toast({ title: 'Aluno removido' }); fetchQueue(); };
  const handleMovePosition = async (entry: QueueEntryWithProfile, dir: 'up' | 'down') => { const tp = dir === 'up' ? entry.position - 1 : entry.position + 1; const sw = queue.find(e => e.position === tp); if (!sw) return; await Promise.all([supabase.from('queue_entries').update({ position: tp }).eq('id', entry.id), supabase.from('queue_entries').update({ position: entry.position }).eq('id', sw.id)]); fetchQueue(); };
  const handleApplyPenalty = async () => { if (!penaltyDialog || !activeSchoolId || !selectedClassroom) return; await applyPenalty(penaltyDialog.userId, selectedClassroom, activeSchoolId, penaltyReason || 'Penalidade pela coordenação'); toast({ title: 'Penalidade aplicada' }); setPenaltyDialog(null); setPenaltyReason(''); fetchQueue(); checkPenaltyAlerts(); };
  const getElapsedTime = (j: string) => `${Math.floor((Date.now() - new Date(j).getTime()) / 60000)}min`;
  const hasAlerts = bathroomAlerts.length > 0 || penaltyAlerts.length > 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-foreground">Painel de Coordenação</h1><p className="text-sm text-muted-foreground">{profile?.full_name}</p></div><Button variant="outline" size="sm" onClick={signOut}><LogOut className="h-4 w-4 mr-1" /> Sair</Button></div>
      {hasAlerts && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-3"><CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Alertas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {bathroomAlerts.map(a => (<div key={`b-${a.user_id}`} className="flex items-center justify-between p-2 rounded bg-destructive/10"><div><span className="font-medium text-destructive">{a.full_name}</span><span className="text-sm text-muted-foreground ml-2">({a.classroom_name})</span></div><Badge variant="destructive"><Clock className="h-3 w-3 mr-1" />{a.minutes_elapsed}min</Badge></div>))}
            {penaltyAlerts.map(a => (<div key={`p-${a.user_id}`} className="flex items-center justify-between p-2 rounded bg-warning/10"><div><span className="font-medium">{a.full_name}</span><span className="text-sm text-muted-foreground ml-2">({a.classroom_name})</span></div><Badge variant="destructive"><ShieldAlert className="h-3 w-3 mr-1" />{a.penalty_count}x</Badge></div>))}
          </CardContent>
        </Card>
      )}
      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Turmas</CardTitle><CardDescription>Selecione uma turma</CardDescription></CardHeader><CardContent><Select value={selectedClassroom ?? ''} onValueChange={setSelectedClassroom}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{classrooms.map(c => (<SelectItem key={c.id} value={c.id}>{c.name} — {c.year}º ano</SelectItem>))}</SelectContent></Select></CardContent></Card>
      {selectedClassroom && (
        <Card>
          <CardHeader className="pb-3"><CardTitle>Fila — {classrooms.find(c => c.id === selectedClassroom)?.name}</CardTitle><CardDescription>{queue.length} aluno(s)</CardDescription></CardHeader>
          <CardContent>
            {queue.length === 0 ? <p className="text-muted-foreground text-center py-8">Fila vazia</p> : (
              <Table><TableHeader><TableRow><TableHead className="w-16">Pos.</TableHead><TableHead>Aluno</TableHead><TableHead>Status</TableHead><TableHead>Tempo</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
              <TableBody>{queue.map(entry => {
                const ib = entry.status === 'in_bathroom';
                return (<TableRow key={entry.id} className={ib ? 'bg-warning/10' : ''}><TableCell className="font-bold">{entry.position}</TableCell><TableCell>{entry.profiles?.full_name ?? '—'}</TableCell><TableCell><Badge variant={ib ? 'destructive' : entry.status === 'waiting' ? 'secondary' : 'default'}>{ib ? 'No banheiro' : entry.status === 'waiting' ? 'Aguardando' : entry.status}</Badge></TableCell><TableCell>{getElapsedTime(entry.joined_at)}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="icon" disabled={entry.position === 1} onClick={() => handleMovePosition(entry, 'up')}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" disabled={entry.position === queue.length} onClick={() => handleMovePosition(entry, 'down')}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setPenaltyDialog({ userId: entry.user_id, userName: entry.profiles?.full_name ?? '' })}><ShieldAlert className="h-4 w-4 text-warning" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveFromQueue(entry)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell></TableRow>);
              })}</TableBody></Table>
            )}
          </CardContent>
        </Card>
      )}
      <Dialog open={!!penaltyDialog} onOpenChange={(o) => { if (!o) setPenaltyDialog(null); }}><DialogContent><DialogHeader><DialogTitle>Aplicar Penalidade</DialogTitle><DialogDescription>Para {penaltyDialog?.userName}</DialogDescription></DialogHeader><input className="w-full rounded border border-input bg-background px-3 py-2 text-sm" placeholder="Motivo (opcional)" value={penaltyReason} onChange={e => setPenaltyReason(e.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setPenaltyDialog(null)}>Cancelar</Button><Button variant="destructive" onClick={handleApplyPenalty}>Aplicar</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
};

export default CoordinatorDashboard;
