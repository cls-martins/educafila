import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GraduationCap, BookOpen, RotateCcw, Shield, LogOut, Plus, School, Search, UserPlus, DoorOpen, Upload } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const DEFAULT_CURSOS = ['Informática', 'Enfermagem', 'Administração', 'Edificações'];
const ANOS = [1, 2, 3];

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

  // Classroom state
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [addClassroomOpen, setAddClassroomOpen] = useState(false);
  const [newClassroomName, setNewClassroomName] = useState('');
  const [newClassroomCurso, setNewClassroomCurso] = useState('');
  const [newClassroomAno, setNewClassroomAno] = useState('');

  // Manual student registration
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualGender, setManualGender] = useState('');
  const [manualClassroomId, setManualClassroomId] = useState('');
  const [manualAno, setManualAno] = useState('');
  const [registering, setRegistering] = useState(false);
  const [lastPassword, setLastPassword] = useState('');

  useEffect(() => { fetchSchools(); }, []);
  useEffect(() => { if (selectedSchoolId) { fetchClassrooms(); fetchCourses(); } }, [selectedSchoolId]);

  const fetchSchools = async () => {
    const { data } = await supabase.from('schools').select('*').order('name');
    if (data) setSchools(data);
  };

  const fetchClassrooms = async () => {
    const { data } = await supabase.from('classrooms').select('*').eq('school_id', selectedSchoolId).order('name');
    if (data) setClassrooms(data);
  };

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.city.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  const handleAddSchool = async () => {
    if (!newSchoolName || !newSchoolCity) return;
    const { error } = await supabase.from('schools').insert({ name: newSchoolName, city: newSchoolCity, crede: newSchoolCrede || null });
    if (error) { toast({ title: 'Erro ao adicionar escola', variant: 'destructive' }); }
    else { toast({ title: 'Escola adicionada!' }); setAddSchoolOpen(false); setNewSchoolName(''); setNewSchoolCity(''); setNewSchoolCrede(''); fetchSchools(); }
  };

  const handleAddClassroom = async () => {
    if (!newClassroomName || !newClassroomAno || !selectedSchoolId) return;
    const insertData: { name: string; school_id: string; year: number; course_id?: string } = {
      name: newClassroomName,
      school_id: selectedSchoolId,
      year: parseInt(newClassroomAno),
    };
    if (newClassroomCurso) insertData.course_id = newClassroomCurso;
    const { error } = await supabase.from('classrooms').insert(insertData);
    if (error) { toast({ title: 'Erro ao criar sala', description: error.message, variant: 'destructive' }); }
    else {
      toast({ title: 'Sala criada!' });
      setAddClassroomOpen(false);
      setNewClassroomName('');
      setNewClassroomCurso('');
      setNewClassroomAno('');
      fetchClassrooms();
    }
  };

  const generatePassword = (name: string) => {
    const clean = name.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return `${clean}@edu2026`;
  };

  const handleManualRegister = async () => {
    if (!manualName || !manualEmail || !selectedSchoolId) {
      toast({ title: 'Preencha nome e email', variant: 'destructive' });
      return;
    }
    setRegistering(true);
    const password = generatePassword(manualName);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: manualEmail.trim().toLowerCase(),
        password,
        options: { data: { full_name: manualName } },
      });
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error('Usuário não criado');

      const profileData = {
        user_id: userId,
        full_name: manualName,
        email: manualEmail.trim().toLowerCase(),
        school_id: selectedSchoolId,
        classroom_id: manualClassroomId || null,
        gender: (manualGender || null) as 'masculino' | 'feminino' | 'outro' | null,
        year: manualAno ? parseInt(manualAno) : null,
        is_active: true,
      };
      await supabase.from('profiles').insert(profileData);
      await supabase.from('user_roles').insert({ user_id: userId, role: 'aluno' as const });

      setLastPassword(password);
      toast({ title: 'Aluno cadastrado!', description: `Senha: ${password}` });
      setManualName('');
      setManualEmail('');
      setManualGender('');
      setManualClassroomId('');
      setManualAno('');
    } catch (err: any) {
      toast({ title: 'Erro ao cadastrar', description: err.message, variant: 'destructive' });
    }
    setRegistering(false);
  };

  const handleCSVUpload = async (file: File, type: 'alunos' | 'professores' | 'gestao') => {
    if (!selectedSchoolId) { toast({ title: 'Selecione uma escola primeiro', variant: 'destructive' }); return; }
    setUploading(true);
    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    let successCount = 0; let errorCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => (row[h] = values[idx] || ''));
      try {
        const email = row.email?.toLowerCase();
        const fullName = row.nome || row.name || row.full_name || '';
        const password = generatePassword(fullName);
        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (authError) { errorCount++; continue; }
        const userId = authData.user?.id;
        if (!userId) { errorCount++; continue; }
        let classroomId: string | null = null;
        if (row.turma || row.classroom) {
          const { data: cls } = await supabase.from('classrooms').select('id').eq('school_id', selectedSchoolId).ilike('name', `%${row.turma || row.classroom}%`).limit(1).single();
          classroomId = cls?.id || null;
        }
        await supabase.from('profiles').insert({
          user_id: userId, full_name: fullName, email, school_id: selectedSchoolId,
          classroom_id: classroomId, gender: (row.genero || row.gender || null) as any,
          year: row.ano ? parseInt(row.ano) : null, is_active: true,
        });
        const roleMap = { alunos: 'aluno', professores: 'professor', gestao: 'gestao' } as const;
        await supabase.from('user_roles').insert({ user_id: userId, role: roleMap[type] });
        if (type === 'professores') { await supabase.from('teacher_schools').insert({ user_id: userId, school_id: selectedSchoolId }); }
        successCount++;
      } catch { errorCount++; }
    }
    toast({ title: 'Importação concluída', description: `${successCount} importados, ${errorCount} erros.` });
    setUploading(false);
  };

  const handleYearTurn = async () => {
    if (!yearTurnSchoolId) { toast({ title: 'Selecione a escola', variant: 'destructive' }); return; }
    setYearTurnLoading(true);
    await supabase.from('profiles').update({ is_active: false }).eq('year', 3).eq('school_id', yearTurnSchoolId);
    await supabase.from('profiles').update({ year: 3 }).eq('year', 2).eq('is_active', true).eq('school_id', yearTurnSchoolId);
    await supabase.from('profiles').update({ year: 2 }).eq('year', 1).eq('is_active', true).eq('school_id', yearTurnSchoolId);
    await supabase.from('queue_entries').delete().eq('school_id', yearTurnSchoolId);
    toast({ title: 'Virada de ano concluída!', description: '1°→2°, 2°→3°, 3° formados inativados.' });
    setYearTurnLoading(false);
  };

  const uploadSections = [
    { key: 'alunos' as const, label: 'Alunos', icon: GraduationCap, desc: 'CSV: nome, email, genero, ano, turma' },
    { key: 'professores' as const, label: 'Professores', icon: BookOpen, desc: 'CSV: nome, email' },
    { key: 'gestao' as const, label: 'Gestão/Direção', icon: Shield, desc: 'CSV: nome, email' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-primary-foreground">EducaFila · Super Admin</h1>
            <p className="text-xs text-primary-foreground/70">{profile?.full_name || 'Administrador'}</p>
          </div>
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" /> Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* School Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <School className="h-5 w-5 text-primary" /> Escolas
              </CardTitle>
              <Dialog open={addSchoolOpen} onOpenChange={setAddSchoolOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Adicionar Escola</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Adicionar Escola</DialogTitle>
                    <DialogDescription>Cadastre uma nova EEEP no sistema.</DialogDescription>
                  </DialogHeader>
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar escola por nome ou cidade..." value={schoolSearch} onChange={(e) => setSchoolSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredSchools.map((s) => (
                <button key={s.id} className={`w-full text-left rounded px-3 py-2 text-sm hover:bg-accent/10 ${selectedSchoolId === s.id ? 'bg-primary/10 border border-primary' : ''}`} onClick={() => setSelectedSchoolId(s.id)}>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.city}{s.crede ? ` · CREDE ${s.crede}` : ''}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {selectedSchool && (
          <Tabs defaultValue="salas" className="w-full">
            <TabsList className="grid w-full grid-cols-5 text-xs">
              <TabsTrigger value="salas"><DoorOpen className="h-3.5 w-3.5 mr-1" />Salas</TabsTrigger>
              <TabsTrigger value="cadastrar"><UserPlus className="h-3.5 w-3.5 mr-1" />Cadastrar</TabsTrigger>
              <TabsTrigger value="importar"><Upload className="h-3.5 w-3.5 mr-1" />Importar</TabsTrigger>
              <TabsTrigger value="ano"><RotateCcw className="h-3.5 w-3.5 mr-1" />Virada</TabsTrigger>
              <TabsTrigger value="novos"><GraduationCap className="h-3.5 w-3.5 mr-1" />Novos</TabsTrigger>
            </TabsList>

            {/* Salas Tab */}
            <TabsContent value="salas" className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Salas de <strong>{selectedSchool.name}</strong></p>
                <Dialog open={addClassroomOpen} onOpenChange={setAddClassroomOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Criar Sala</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Sala</DialogTitle>
                      <DialogDescription>Adicione uma nova sala para {selectedSchool.name}.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Nome da Sala</Label>
                        <Input value={newClassroomName} onChange={(e) => setNewClassroomName(e.target.value)} placeholder="Ex: INFO 1A" />
                      </div>
                      <div>
                        <Label>Curso</Label>
                        <Select value={newClassroomCurso} onValueChange={setNewClassroomCurso}>
                          <SelectTrigger><SelectValue placeholder="Selecionar curso" /></SelectTrigger>
                          <SelectContent>
                            {CURSOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Ano</Label>
                        <Select value={newClassroomAno} onValueChange={setNewClassroomAno}>
                          <SelectTrigger><SelectValue placeholder="Selecionar ano" /></SelectTrigger>
                          <SelectContent>
                            {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}° Ano</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter><Button onClick={handleAddClassroom}>Criar</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {classrooms.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma sala cadastrada. Crie a primeira sala.</CardContent></Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {classrooms.map((c) => (
                    <Card key={c.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.course || 'Sem curso'} · {c.year ? `${c.year}° Ano` : ''}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Total: {classrooms.length}/12 salas</p>
            </TabsContent>

            {/* Cadastrar Manualmente Tab */}
            <TabsContent value="cadastrar" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserPlus className="h-5 w-5 text-primary" /> Cadastrar Aluno Manualmente
                  </CardTitle>
                  <CardDescription>Cadastre um aluno e receba a senha gerada automaticamente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Nome Completo *</Label>
                      <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Maria Silva" />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="maria@aluno.ce.gov.br" />
                    </div>
                    <div>
                      <Label>Gênero</Label>
                      <Select value={manualGender} onValueChange={setManualGender}>
                        <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="masculino">Masculino</SelectItem>
                          <SelectItem value="feminino">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Ano</Label>
                      <Select value={manualAno} onValueChange={setManualAno}>
                        <SelectTrigger><SelectValue placeholder="Selecionar ano" /></SelectTrigger>
                        <SelectContent>
                          {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}° Ano</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Sala</Label>
                      <Select value={manualClassroomId} onValueChange={setManualClassroomId}>
                        <SelectTrigger><SelectValue placeholder="Selecionar sala" /></SelectTrigger>
                        <SelectContent>
                          {classrooms.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name} — {c.course} {c.year}° Ano</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleManualRegister} disabled={registering} className="w-full">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {registering ? 'Cadastrando...' : 'Cadastrar Aluno'}
                  </Button>
                  {lastPassword && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <p className="text-sm font-medium text-foreground">✅ Último aluno cadastrado</p>
                      <p className="text-sm text-muted-foreground mt-1">Senha gerada: <strong className="text-foreground font-mono">{lastPassword}</strong></p>
                      <p className="text-xs text-muted-foreground mt-1">Anote e envie ao aluno.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Importar CSV Tab */}
            <TabsContent value="importar" className="pt-4 space-y-4">
              <p className="text-sm text-muted-foreground">Importando para: <strong>{selectedSchool.name}</strong></p>
              {uploadSections.map((section) => (
                <Card key={section.key}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <section.icon className="h-5 w-5 text-primary" /> Importar {section.label}
                    </CardTitle>
                    <CardDescription>{section.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Input type="file" accept=".csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCSVUpload(file, section.key); }} disabled={uploading} />
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Virada de Ano Tab */}
            <TabsContent value="ano" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-primary" /> Virada de Ano Letivo
                  </CardTitle>
                  <CardDescription>Escola: <strong>{selectedSchool.name}</strong> — 1°→2°, 2°→3°, 3° inativados, filas zeradas.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="lg" disabled={yearTurnLoading} onClick={() => setYearTurnSchoolId(selectedSchoolId)}>
                        <RotateCcw className="mr-2 h-4 w-4" />{yearTurnLoading ? 'Processando...' : 'Executar Virada'}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Virada de Ano?</AlertDialogTitle>
                        <AlertDialogDescription>Ação irreversível para {selectedSchool.name}.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleYearTurn}>Confirmar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Novos 1° Ano Tab */}
            <TabsContent value="novos" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5 text-primary" /> Importar Novos 1° Ano
                  </CardTitle>
                  <CardDescription>CSV: nome, email, genero, turma</CardDescription>
                </CardHeader>
                <CardContent>
                  <Input type="file" accept=".csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCSVUpload(file, 'alunos'); }} disabled={uploading} />
                  <p className="text-xs text-muted-foreground mt-2">Os alunos serão cadastrados automaticamente como 1° ano.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
