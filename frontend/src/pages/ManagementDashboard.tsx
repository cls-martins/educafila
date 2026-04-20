import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, AlertTriangle, Users, Clock, Crown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScheduleManager } from '@/components/ScheduleManager';
import { LeaderManager } from '@/components/LeaderManager';

const ManagementDashboard = () => {
  const { profile, signOut, activeSchoolId } = useAuth();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [queueData, setQueueData] = useState<Record<string, any[]>>({});
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!activeSchoolId) return;
    const fetchClassrooms = async () => {
      const { data } = await supabase.from('classrooms').select('*').eq('school_id', activeSchoolId).order('name');
      if (data) {
        setClassrooms(data);
        const queues: Record<string, any[]> = {};
        for (const c of data) {
          const { data: q } = await supabase.from('queue_entries').select('*').eq('classroom_id', c.id).order('position');
          const entries = (q ?? []) as any[];
          const ids = Array.from(new Set(entries.map((e) => e.user_id)));
          let profMap: Record<string, any> = {};
          if (ids.length) {
            const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
            for (const p of (profs ?? []) as any[]) profMap[p.user_id] = p;
          }
          queues[c.id] = entries.map((e) => ({ ...e, profiles: profMap[e.user_id] }));
        }
        setQueueData(queues);
      }
    };
    fetchClassrooms();
    const checkAlerts = async () => {
      const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const { data } = await supabase.from('bathroom_logs').select('*, classrooms(name)').eq('school_id', activeSchoolId).is('end_time', null).lt('start_time', sixMinAgo);
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let profMap: Record<string, any> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
        for (const p of (profs ?? []) as any[]) profMap[p.user_id] = p;
      }
      setAlerts(rows.map((r) => ({ ...r, profiles: profMap[r.user_id] })));
    };
    checkAlerts();
    const interval = setInterval(checkAlerts, 30000);
    return () => clearInterval(interval);
  }, [activeSchoolId]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div><h1 className="text-lg font-bold text-foreground">EducaFila · Gestão</h1><p className="text-xs text-muted-foreground">{profile?.full_name}</p></div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Sair</Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 space-y-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Visão das Salas</TabsTrigger>
            <TabsTrigger value="schedules" data-testid="tab-schedules">Horários da Fila</TabsTrigger>
            <TabsTrigger value="leaders" data-testid="tab-leaders">Líderes</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-6">
        {alerts.length > 0 && (
          <Card className="border-destructive">
            <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Alertas de Tempo Excedido</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-destructive/10 p-3">
                  <div><p className="text-sm font-medium">{(a.profiles as any)?.full_name}</p><p className="text-xs text-muted-foreground">Sala: {(a.classrooms as any)?.name}</p></div>
                  <Badge variant="destructive"><Clock className="mr-1 h-3 w-3" /> Excedido</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <h2 className="text-xl font-semibold text-foreground">Visão das Salas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classrooms.map((c: any) => {
            const q = queueData[c.id] || []; const inBathroom = q.filter((e: any) => e.status === 'in_bathroom');
            return (
              <Card key={c.id} className={inBathroom.length > 0 ? 'border-warning' : ''}>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{c.name}</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1"><Users className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{q.length} na fila</span></div>
                    {inBathroom.length > 0 && <div className="flex items-center gap-1 text-warning"><Clock className="h-4 w-4" /><span className="text-sm">{inBathroom.length} no banheiro</span></div>}
                  </div>
                  {q.length > 0 && (<div className="mt-2 space-y-1">{q.slice(0, 3).map((e: any) => (<p key={e.id} className="text-xs text-muted-foreground">{e.position}° — {(e.profiles as any)?.full_name}{e.status === 'in_bathroom' && ' 🚻'}</p>))}{q.length > 3 && <p className="text-xs text-muted-foreground/60">+{q.length - 3} mais</p>}</div>)}
                </CardContent>
              </Card>
            );
          })}
        </div>
          </TabsContent>
          <TabsContent value="schedules">
            {activeSchoolId ? (
              <ScheduleManager schoolId={activeSchoolId} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma escola ativa.</p>
            )}
          </TabsContent>
          <TabsContent value="leaders">
            {activeSchoolId ? (
              <LeaderManager schoolId={activeSchoolId} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma escola ativa.</p>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ManagementDashboard;
