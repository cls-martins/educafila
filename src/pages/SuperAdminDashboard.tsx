import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GraduationCap, BookOpen, RotateCcw, Shield, LogOut, Plus, School, Search } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const SuperAdminDashboard = () => {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [yearTurnLoading, setYearTurnLoading] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [addSchoolOpen, setAddSchoolOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCity, setNewSchoolCity] = useState('');
  const [newSchoolCrede, setNewSchoolCrede] = useState('');
  const [yearTurnSchoolId, setYearTurnSchoolId] = useState<string>('');

  useEffect(() => { fetchSchools(); }, []);
  const fetchSchools = async () => { const { data } = await supabase.from('schools').select('*').order('name'); if (data) setSchools(data); };
  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
  const filteredSchools = schools.filter((s) => s.name.toLowerCase().includes(schoolSearch.toLowerCase()) || s.city.toLowerCase().includes(schoolSearch.toLowerCase()));

  const handleAddSchool = async () => {
    if (!newSchoolName || !newSchoolCity) return;
    const { error } = await supabase.from('schools').insert({ name: newSchoolName, city: newSchoolCity, crede: newSchoolCrede || null });
    if (error) { toast({ title: 'Erro ao adicionar escola', variant: 'destructive' }); }
    else { toast({ title: 'Escola adicionada!' }); setAddSchoolOpen(false); setNewSchoolName(''); setNewSchoolCity(''); setNewSchoolCrede(''); fetchSchools(); }
  };

  const generatePassword = (name: string) => { const clean = name.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return `${clean}@edu2026`; };

  const handleCSVUpload = async (file: File, type: 'alunos' | 'professores' | 'gestao') => {
    if (!selectedSchoolId) { toast({ title: 'Selecione uma escola primeiro', variant: 'destructive' }); return; }
    setUploading(true);
    const text = await file.text(); const lines = text.split('\n').filter((l) => l.trim()); const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    let successCount = 0; let errorCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim()); const row: Record<string, string> = {}; headers.forEach((h, idx) => (row[h] = values[idx] || ''));
      try {
        const email = row.email?.toLowerCase(); const fullName = row.nome || row.name || row.full_name || ''; const password = generatePassword(fullName);
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (authError) { errorCount++; continue; } const userId = authData.user?.id; if (!userId) { errorCount++; continue; }
        let classroomId: string | null = null;
        if (row.turma || row.classroom) { const { data: cls } = await supabase.from('classrooms').select('id').eq('school_id', selectedSchoolId).ilike('name', `%${row.turma || row.classroom}%`).limit(1).single(); classroomId = cls?.id || null; }
        await supabase.from('profiles').insert({ user_id: userId, full_name: fullName, email, school_id: selectedSchoolId, classroom_id: classroomId, gender: (row.genero || row.gender || null) as any, year: row.ano ? parseInt(row.ano) : null, is_active: true });
        const roleMap = { alunos: 'aluno', professores: 'professor', gestao: 'gestao' } as const;
        await supabase.from('user_roles').insert({ user_id: userId, role: roleMap[type] });
        if (type === 'professores') { await supabase.from('teacher_schools').insert({ user_id: userId, school_id: selectedSchoolId }); }
        successCount++;
      } catch { errorCount++; }
    }
    toast({ title: 'Importação concluída', description: `${successCount} importados, ${errorCount} erros.` }); setUploading(false);
  };

  const handleYearTurn = async () => {
    if (!yearTurnSchoolId) { toast({ title: 'Selecione a escola', variant: 'destructive' }); return; }
    setYearTurnLoading(true);
    await supabase.from('profiles').update({ is_active: false }).eq('year', 3).eq('school_id', yearTurnSchoolId);
    await supabase.from('profiles').update({ year: 3 }).eq('year', 2).eq('is_active', true).eq('school_id', yearTurnSchoolId);
    await supabase.from('profiles').update({ year: 2 }).eq('year', 1).eq('is_active', true).eq('school_id', yearTurnSchoolId);
    await supabase.from('queue_entries').delete().eq('school_id', yearTurnSchoolId);
    toast({ title: 'Virada de ano concluída!', description: '1°→2°, 2°→3°, 3° formados inativados.' }); setYearTurnLoading(false);
  };

  const uploadSections = [
    { key: 'alunos' as const, label: 'Alunos', icon: GraduationCap, desc: 'CSV: nome, email, genero, ano, turma' },
    { key: 'professores' as const, label: 'Professores', icon: BookOpen, desc: 'CSV: nome, email' },
    { key: 'gestao' as const, label: 'Gestão/Direção', icon: Shield, desc: 'CSV: nome, email' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div><h1 className="text-lg font-bold text-foreground">EducaFila · Super Admin</h1><p className="text-xs text-muted-foreground">{profile?.full_name || 'Administrador'}</p></div>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Sair</Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><School className="h-5 w-5 text-primary" /> Escolas</CardTitle>
              <Dialog open={addSchoolOpen} onOpenChange={setAddSchoolOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" /> Adicionar Escola</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Adicionar Escola</DialogTitle><DialogDescription>Cadastre uma nova EEEP no sistema.</DialogDescription></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Nome da Escola</Label><Input value={newSchoolName} onChange={(e) => setNewSchoolName(e.target.value)} placeholder="EEEP ..." /></div>
                    <div><Label>Cidade</Label><Input value={newSchoolCity} onChange={(e) => setNewSchoolCity(e.target.value)} placeholder="Fortaleza" /></div>
                    <div><Label>CREDE (opcional)</Label><Input value={newSchoolCrede} onChange={(e) => setNewSchoolCrede(e.target.value)} placeholder="1" /></div>
                  </div>
                  <DialogFooter><Button onClick={handleAddSchool}>Salvar</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar escola por nome ou cidade..." value={schoolSearch} onChange={(e) => setSchoolSearch(e.target.value)} className="pl-9" /></div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredSchools.map((s) => (
                <button key={s.id} className={`w-full text-left rounded px-3 py-2 text-sm hover:bg-accent ${selectedSchoolId === s.id ? 'bg-primary/10 border border-primary' : ''}`} onClick={() => setSelectedSchoolId(s.id)}>
                  <p className="font-medium text-foreground">{s.name}</p><p className="text-xs text-muted-foreground">{s.city}{s.crede ? ` · CREDE ${s.crede}` : ''}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        {selectedSchool && (
          <Tabs defaultValue="importar" className="w-full">
            <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="importar">Importar Usuários</TabsTrigger><TabsTrigger value="ano">Virada de Ano</TabsTrigger><TabsTrigger value="novos">Novos 1° Ano</TabsTrigger></TabsList>
            <TabsContent value="importar" className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">Importando para: <strong>{selectedSchool.name}</strong></p>
              {uploadSections.map((section) => (
                <Card key={section.key}>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><section.icon className="h-5 w-5 text-primary" /> Importar {section.label}</CardTitle><CardDescription>{section.desc}</CardDescription></CardHeader>
                  <CardContent><Input type="file" accept=".csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCSVUpload(file, section.key); }} disabled={uploading} /></CardContent>
                </Card>
              ))}
            </TabsContent>
            <TabsContent value="ano" className="pt-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" /> Virada de Ano Letivo</CardTitle><CardDescription>Escola: <strong>{selectedSchool.name}</strong> — 1°→2°, 2°→3°, 3° inativados, filas zeradas.</CardDescription></CardHeader>
                <CardContent>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="destructive" size="lg" disabled={yearTurnLoading} onClick={() => setYearTurnSchoolId(selectedSchoolId)}><RotateCcw className="mr-2 h-4 w-4" />{yearTurnLoading ? 'Processando...' : 'Executar Virada'}</Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar Virada de Ano?</AlertDialogTitle><AlertDialogDescription>Ação irreversível para {selectedSchool.name}.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleYearTurn}>Confirmar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="novos" className="pt-4">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /> Importar Novos 1° Ano</CardTitle><CardDescription>CSV: nome, email, genero, turma</CardDescription></CardHeader>
                <CardContent><Input type="file" accept=".csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCSVUpload(file, 'alunos'); }} disabled={uploading} /><p className="text-xs text-muted-foreground mt-2">Os alunos serão cadastrados automaticamente como 1° ano.</p></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
