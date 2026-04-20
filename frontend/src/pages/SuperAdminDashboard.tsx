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
import { BookOpen, RotateCcw, LogOut, Plus, School, Search, UserPlus, DoorOpen, Upload, ArrowLeft, UserX, Users, Pencil, Trash2, Clock } from 'lucide-react';
import { ScheduleManager } from '@/components/ScheduleManager';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { adminCreateStaff, adminCreateStudent, adminBulkStudents, adminDeleteUser } from '@/lib/adminApi';

const ANOS = [1, 2, 3];

/**
 * Lightweight helper kept for legacy flows (fallback only). Staff / student
 * creation now goes through the protected backend endpoint which uses
 * service_role and never hijacks the admin's browser session.
 */
async function signUpPreservingAdmin(
  email: string,
  password: string,
  fullName: string,
): Promise<{ userId: string | null; error: any | null }> {
  const { data: { session: adminSession } } = await supabase.auth.getSession();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (adminSession) {
    try {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });
    } catch (e) {
      console.error('Failed to restore admin session', e);
    }
  }
  if (signUpError) return { userId: null, error: signUpError };
  return { userId: signUpData.user?.id ?? null, error: null };
}

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

  // Courses state
  const [newCourseName, setNewCourseName] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [editCourseId, setEditCourseId] = useState<string | null>(null);
  const [editCourseName, setEditCourseName] = useState('');

  // Classroom panel state
  const [selectedClassroom, setSelectedClassroom] = useState<any>(null);
  const [renameClassroomOpen, setRenameClassroomOpen] = useState(false);
  const [renameClassroomValue, setRenameClassroomValue] = useState('');

  // Manual registration (aluno inside classroom)
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualGender, setManualGender] = useState('');
  const [registering, setRegistering] = useState(false);
  const [lastPassword, setLastPassword] = useState('');

  // Manual registration (professor/gestão)
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<'professor' | 'gestao'>('professor');
  const [staffRegistering, setStaffRegistering] = useState(false);
  const [lastStaffPassword, setLastStaffPassword] = useState('');

  // Staff list (professors/gestão)
  const [staffList, setStaffList] = useState<any[]>([]);

  // Students list inside the opened classroom
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => { fetchSchools(); }, []);
  useEffect(() => {
    if (selectedSchoolId) { fetchClassrooms(); fetchCourses(); fetchStaff(); }
  }, [selectedSchoolId]);
  useEffect(() => {
    if (selectedClassroom?.id) fetchStudents();
    else setStudentsList([]);
  }, [selectedClassroom?.id]);

  const fetchSchools = async () => {
    const { data } = await supabase.from('schools').select('*').order('name');
    if (data) setSchools(data);
  };

  const fetchClassrooms = async () => {
    const { data } = await supabase.from('classrooms').select('*, courses(name)').eq('school_id', selectedSchoolId).order('name');
    if (data) setClassrooms(data);
  };

  const fetchCourses = async () => {
    const { data } = await supabase.from('courses').select('*').eq('school_id', selectedSchoolId).order('name');
    if (data) setCourses(data);
  };

  const fetchStaff = async () => {
    // profiles and user_roles have no direct FK between them (both join via auth.users.id),
    // so PostgREST embed syntax doesn't work. We fetch separately and merge client-side.
    const { data: roleRows, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('role', ['professor', 'gestao']);
    if (rolesError) { console.error('fetchStaff roles error', rolesError); setStaffList([]); return; }
    const staffIds = (roleRows || []).map((r: any) => r.user_id);
    if (!staffIds.length) { setStaffList([]); return; }

    const { data: profs, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('school_id', selectedSchoolId)
      .in('user_id', staffIds)
      .order('full_name');
    if (profError) { console.error('fetchStaff profiles error', profError); setStaffList([]); return; }

    const rolesByUser: Record<string, string[]> = {};
    (roleRows || []).forEach((r: any) => {
      rolesByUser[r.user_id] = rolesByUser[r.user_id] || [];
      rolesByUser[r.user_id].push(r.role);
    });
    const enriched = (profs || []).map((p: any) => ({
      ...p,
      user_roles: (rolesByUser[p.user_id] || []).map((role) => ({ role })),
    }));
    setStaffList(enriched);
  };

  const fetchStudents = async () => {
    if (!selectedClassroom?.id) return;
    setStudentsLoading(true);
    // Same rationale: fetch profiles then filter to those with role=aluno
    const { data: profs, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('classroom_id', selectedClassroom.id)
      .order('full_name');
    if (profError) {
      console.error('fetchStudents profiles error', profError);
      setStudentsList([]);
      setStudentsLoading(false);
      return;
    }
    const ids = (profs || []).map((p: any) => p.user_id);
    if (!ids.length) { setStudentsList([]); setStudentsLoading(false); return; }
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', ids)
      .eq('role', 'aluno');
    const alunoIds = new Set((roles || []).map((r: any) => r.user_id));
    setStudentsList((profs || []).filter((p: any) => alunoIds.has(p.user_id)));
    setStudentsLoading(false);
  };

  const handleInactivateStudent = async (userId: string) => {
    await supabase.from('profiles').update({ is_active: false }).eq('user_id', userId);
    toast({ title: 'Aluno inativado' });
    fetchStudents();
  };

  const handleReactivateStudent = async (userId: string) => {
    await supabase.from('profiles').update({ is_active: true }).eq('user_id', userId);
    toast({ title: 'Aluno reativado' });
    fetchStudents();
  };

  const handleDeleteStudent = async (userId: string, fullName: string) => {
    try {
      await adminDeleteUser(userId);
      toast({ title: `${fullName} apagado definitivamente` });
      fetchStudents();
    } catch (err: any) {
      toast({ title: 'Erro ao apagar', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteStaff = async (userId: string, fullName: string) => {
    try {
      await adminDeleteUser(userId);
      toast({ title: `${fullName} apagado definitivamente` });
      fetchStaff();
    } catch (err: any) {
      toast({ title: 'Erro ao apagar', description: err.message, variant: 'destructive' });
    }
  };

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.city.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  const handleAddSchool = async () => {
    if (!newSchoolName || !newSchoolCity) return;
    const { data, error } = await supabase
      .from('schools')
      .insert({ name: newSchoolName, city: newSchoolCity, crede: newSchoolCrede || null })
      .select()
      .single();
    if (error) {
      toast({ title: 'Erro ao adicionar escola', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Escola adicionada!', description: 'Agora cadastre os cursos na aba "Cursos".' });
      setAddSchoolOpen(false);
      setNewSchoolName('');
      setNewSchoolCity('');
      setNewSchoolCrede('');
      await fetchSchools();
      if (data?.id) setSelectedSchoolId(data.id);
    }
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

  // ===== Courses =====
  const handleCreateCourse = async () => {
    if (!newCourseName.trim() || !selectedSchoolId) return;
    setCreatingCourse(true);
    try {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({ name: newCourseName.trim(), school_id: selectedSchoolId })
        .select()
        .single();
      if (courseError) throw courseError;

      // Auto-generate 1°, 2°, 3° ano classrooms for this course
      const rows = ANOS.map((year) => ({
        name: `${newCourseName.trim()} ${year}° Ano`,
        school_id: selectedSchoolId,
        year,
        course_id: course.id,
      }));
      const { error: crError } = await supabase.from('classrooms').insert(rows);
      if (crError) throw crError;

      toast({ title: 'Curso criado!', description: 'Salas de 1°, 2° e 3° ano geradas automaticamente.' });
      setNewCourseName('');
      await fetchCourses();
      await fetchClassrooms();
    } catch (err: any) {
      toast({ title: 'Erro ao criar curso', description: err.message, variant: 'destructive' });
    }
    setCreatingCourse(false);
  };

  const handleRenameCourse = async (courseId: string) => {
    if (!editCourseName.trim()) return;
    const { error } = await supabase
      .from('courses')
      .update({ name: editCourseName.trim() })
      .eq('id', courseId);
    if (error) {
      toast({ title: 'Erro ao renomear', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Curso renomeado' });
      setEditCourseId(null);
      setEditCourseName('');
      await fetchCourses();
      await fetchClassrooms();
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    // Remove course reference from classrooms (keep the rooms) then delete course
    await supabase.from('classrooms').update({ course_id: null }).eq('course_id', courseId);
    const { error } = await supabase.from('courses').delete().eq('id', courseId);
    if (error) {
      toast({ title: 'Erro ao apagar curso', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Curso apagado' });
      await fetchCourses();
      await fetchClassrooms();
    }
  };

  // ===== Classroom rename / delete =====
  const handleRenameClassroom = async () => {
    if (!selectedClassroom || !renameClassroomValue.trim()) return;
    const { error } = await supabase
      .from('classrooms')
      .update({ name: renameClassroomValue.trim() })
      .eq('id', selectedClassroom.id);
    if (error) {
      toast({ title: 'Erro ao renomear sala', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Sala renomeada' });
      setSelectedClassroom({ ...selectedClassroom, name: renameClassroomValue.trim() });
      setRenameClassroomOpen(false);
      await fetchClassrooms();
    }
  };

  const generatePassword = (name: string) => {
    const clean = name.toLowerCase().replace(/\s+/g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return `${clean}@edu2026`;
  };

  // Register student inside a classroom panel (auto-assigns classroom)
  const handleManualRegister = async () => {
    if (!manualName || !manualEmail || !selectedSchoolId || !selectedClassroom) {
      toast({ title: 'Preencha nome e email', variant: 'destructive' });
      return;
    }
    setRegistering(true);
    try {
      const result = await adminCreateStudent({
        full_name: manualName,
        email: manualEmail.trim().toLowerCase(),
        school_id: selectedSchoolId,
        classroom_id: selectedClassroom.id,
        gender: manualGender || null,
        year: selectedClassroom.year || null,
      });
      setLastPassword(result.password);
      toast({ title: 'Aluno cadastrado!', description: `Senha: ${result.password}` });
      setManualName('');
      setManualEmail('');
      setManualGender('');
      await fetchStudents();
    } catch (err: any) {
      toast({ title: 'Erro ao cadastrar', description: err.message, variant: 'destructive' });
    }
    setRegistering(false);
  };

  // Register professor or gestão manually
  const handleStaffRegister = async () => {
    if (!staffName || !staffEmail || !selectedSchoolId) {
      toast({ title: 'Preencha nome e email', variant: 'destructive' });
      return;
    }
    setStaffRegistering(true);
    try {
      const result = await adminCreateStaff({
        full_name: staffName,
        email: staffEmail.trim().toLowerCase(),
        school_id: selectedSchoolId,
        role: staffRole,
      });
      setLastStaffPassword(result.password);
      toast({
        title: `${staffRole === 'professor' ? 'Professor' : 'Gestão'} cadastrado!`,
        description: `Senha: ${result.password}`,
      });
      setStaffName('');
      setStaffEmail('');
      await fetchStaff();
    } catch (err: any) {
      toast({ title: 'Erro ao cadastrar', description: err.message, variant: 'destructive' });
    }
    setStaffRegistering(false);
  };

  // Inactivate staff
  const handleInactivateStaff = async (userId: string) => {
    await supabase.from('profiles').update({ is_active: false }).eq('user_id', userId);
    toast({ title: 'Usuário inativado!' });
    fetchStaff();
  };

  // CSV upload for students inside classroom panel
  const handleCSVUploadClassroom = async (file: File) => {
    if (!selectedSchoolId || !selectedClassroom) return;
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter((l) => l.trim());
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const students: Array<{ full_name: string; email: string; gender?: string | null }> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => (row[h] = values[idx] || ''));
        const fullName = (row.nome || row.name || row.full_name || '').trim();
        const email = (row.email || '').trim().toLowerCase();
        if (!fullName || !email) continue;
        students.push({ full_name: fullName, email, gender: row.genero || row.gender || null });
      }
      if (!students.length) {
        toast({ title: 'CSV vazio ou inválido', variant: 'destructive' });
        setUploading(false);
        return;
      }
      const result = await adminBulkStudents({
        school_id: selectedSchoolId,
        classroom_id: selectedClassroom.id,
        year: selectedClassroom.year || null,
        students,
      });
      toast({
        title: 'Importação concluída',
        description: `${result.success.length} importados, ${result.errors.length} erros.`,
      });
      await fetchStudents();
    } catch (err: any) {
      toast({ title: 'Erro na importação', description: err.message, variant: 'destructive' });
    }
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

  // Classroom panel view
  if (selectedClassroom) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-primary px-4 py-3">
          <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => setSelectedClassroom(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-primary-foreground">{selectedClassroom.name}</h1>
                <p className="text-xs text-primary-foreground/70">{selectedClassroom.courses?.name || ''} · {selectedClassroom.year}° Ano · {selectedSchool?.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Dialog open={renameClassroomOpen} onOpenChange={(open) => { setRenameClassroomOpen(open); if (open) setRenameClassroomValue(selectedClassroom.name); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10">
                    <Pencil className="mr-1 h-4 w-4" /> Renomear
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Renomear Sala</DialogTitle>
                    <DialogDescription>Novo nome para "{selectedClassroom.name}"</DialogDescription>
                  </DialogHeader>
                  <Input value={renameClassroomValue} onChange={(e) => setRenameClassroomValue(e.target.value)} />
                  <DialogFooter>
                    <Button onClick={handleRenameClassroom}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={signOut}>
                <LogOut className="mr-1 h-4 w-4" /> Sair
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 space-y-6">
          <Tabs defaultValue="alunos" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="alunos"><Users className="h-3.5 w-3.5 mr-1" />Alunos</TabsTrigger>
              <TabsTrigger value="cadastrar"><UserPlus className="h-3.5 w-3.5 mr-1" />Cadastrar</TabsTrigger>
              <TabsTrigger value="importar"><Upload className="h-3.5 w-3.5 mr-1" />Importar CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="alunos" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-5 w-5 text-primary" /> Alunos da Sala
                  </CardTitle>
                  <CardDescription>
                    {studentsLoading ? 'Carregando...' : `${studentsList.length} aluno(s) nesta sala.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!studentsLoading && studentsList.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Nenhum aluno cadastrado nesta sala ainda. Use as abas "Cadastrar" ou "Importar CSV".
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {studentsList.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{s.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {s.gender && <Badge variant="outline" className="text-[10px]">{s.gender}</Badge>}
                              {!s.is_active && <Badge variant="outline" className="text-[10px] text-destructive border-destructive">Inativo</Badge>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {s.is_active ? (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Inativar {s.full_name}?</AlertDialogTitle>
                                    <AlertDialogDescription>O aluno não conseguirá mais acessar o sistema.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleInactivateStudent(s.user_id)}>Inativar</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => handleReactivateStudent(s.user_id)}>
                                  Reativar
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Apagar definitivamente">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Apagar {s.full_name} definitivamente?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Essa ação <strong>não pode ser desfeita</strong>. Todos os dados do aluno
                                        (perfil, login, papéis e histórico) serão permanentemente removidos do banco.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteStudent(s.user_id, s.full_name)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Apagar definitivamente
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="cadastrar" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserPlus className="h-5 w-5 text-primary" /> Cadastrar Aluno
                  </CardTitle>
                  <CardDescription>Sala: <strong>{selectedClassroom.name}</strong> — O aluno será vinculado automaticamente a esta sala.</CardDescription>
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

            <TabsContent value="importar" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Upload className="h-5 w-5 text-primary" /> Importar Alunos em Massa
                  </CardTitle>
                  <CardDescription>
                    CSV com colunas: <strong>nome, email, genero</strong> (opcional).<br />
                    Todos serão vinculados à sala <strong>{selectedClassroom.name}</strong> automaticamente.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Input type="file" accept=".csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCSVUploadClassroom(file); }} disabled={uploading} />
                  {uploading && <p className="text-xs text-muted-foreground mt-2">Importando...</p>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }

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
                    <DialogDescription>Cadastre uma nova EEEP. Em seguida cadastre os cursos na aba "Cursos".</DialogDescription>
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
          <Tabs defaultValue="cursos" className="w-full">
            <TabsList className="grid w-full grid-cols-5 text-xs">
              <TabsTrigger value="cursos"><BookOpen className="h-3.5 w-3.5 mr-1" />Cursos</TabsTrigger>
              <TabsTrigger value="salas"><DoorOpen className="h-3.5 w-3.5 mr-1" />Salas</TabsTrigger>
              <TabsTrigger value="equipe"><Users className="h-3.5 w-3.5 mr-1" />Equipe</TabsTrigger>
              <TabsTrigger value="horarios" data-testid="tab-horarios"><Clock className="h-3.5 w-3.5 mr-1" />Horários</TabsTrigger>
              <TabsTrigger value="ano"><RotateCcw className="h-3.5 w-3.5 mr-1" />Virada</TabsTrigger>
            </TabsList>

            {/* Cursos Tab */}
            <TabsContent value="cursos" className="pt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-5 w-5 text-primary" /> Cursos de {selectedSchool.name}
                  </CardTitle>
                  <CardDescription>Ao criar um curso, são geradas automaticamente 3 salas (1°, 2° e 3° ano). Você pode renomear ou apagar depois.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      placeholder="Nome do curso (ex: Informática)"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCourse(); }}
                    />
                    <Button onClick={handleCreateCourse} disabled={creatingCourse || !newCourseName.trim()}>
                      <Plus className="mr-1 h-4 w-4" />{creatingCourse ? 'Criando...' : 'Criar Curso'}
                    </Button>
                  </div>

                  {courses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum curso cadastrado ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {courses.map((c) => (
                        <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                          {editCourseId === c.id ? (
                            <div className="flex-1 flex gap-2">
                              <Input
                                value={editCourseName}
                                onChange={(e) => setEditCourseName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameCourse(c.id); }}
                                autoFocus
                              />
                              <Button size="sm" onClick={() => handleRenameCourse(c.id)}>Salvar</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditCourseId(null); setEditCourseName(''); }}>Cancelar</Button>
                            </div>
                          ) : (
                            <>
                              <div>
                                <p className="text-sm font-medium text-foreground">{c.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {classrooms.filter((cl) => cl.course_id === c.id).length} sala(s) vinculada(s)
                                </p>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => { setEditCourseId(c.id); setEditCourseName(c.name); }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Apagar curso "{c.name}"?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        As salas vinculadas não serão apagadas, apenas desvinculadas do curso.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteCourse(c.id)}>Apagar</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Salas Tab */}
            <TabsContent value="salas" className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Salas de <strong>{selectedSchool.name}</strong> — clique para abrir o painel</p>
                <Dialog open={addClassroomOpen} onOpenChange={setAddClassroomOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Criar Sala Avulsa</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar Sala Avulsa</DialogTitle>
                      <DialogDescription>Use apenas para salas extras. Para um curso novo, prefira criar pela aba "Cursos" (gera 3 salas automaticamente).</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Nome da Sala</Label>
                        <Input value={newClassroomName} onChange={(e) => setNewClassroomName(e.target.value)} placeholder="Ex: INFO 1A" />
                      </div>
                      <div>
                        <Label>Curso</Label>
                        <Select value={newClassroomCurso} onValueChange={setNewClassroomCurso}>
                          <SelectTrigger><SelectValue placeholder={courses.length ? 'Selecionar curso' : 'Crie cursos primeiro'} /></SelectTrigger>
                          <SelectContent>
                            {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhuma sala cadastrada. Comece criando cursos na aba "Cursos".</CardContent></Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {classrooms.map((c) => (
                    <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedClassroom(c)}>
                      <CardContent className="p-4">
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.courses?.name || 'Sem curso'} · {c.year ? `${c.year}° Ano` : ''}</p>
                        <p className="text-xs text-primary mt-1">Clique para abrir →</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Total: {classrooms.length} sala(s)</p>
            </TabsContent>

            {/* Equipe Tab — cadastrar professor/gestão + inativar */}
            <TabsContent value="equipe" className="pt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserPlus className="h-5 w-5 text-primary" /> Cadastrar Professor ou Gestão
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Nome Completo *</Label>
                      <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="João Silva" />
                    </div>
                    <div>
                      <Label>Email *</Label>
                      <Input type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="joao@email.com" />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={staffRole} onValueChange={(v) => setStaffRole(v as 'professor' | 'gestao')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professor">Professor</SelectItem>
                          <SelectItem value="gestao">Gestão / Direção / Coordenação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleStaffRegister} disabled={staffRegistering} className="w-full">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {staffRegistering ? 'Cadastrando...' : 'Cadastrar'}
                  </Button>
                  {lastStaffPassword && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <p className="text-sm font-medium text-foreground">✅ Cadastrado com sucesso</p>
                      <p className="text-sm text-muted-foreground mt-1">Senha: <strong className="text-foreground font-mono">{lastStaffPassword}</strong></p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-5 w-5 text-primary" /> Professores e Gestão
                  </CardTitle>
                  <CardDescription>Inative usuários que não fazem mais parte da escola.</CardDescription>
                </CardHeader>
                <CardContent>
                  {staffList.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum professor ou gestor cadastrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {staffList.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">{s.full_name}</p>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                            <div className="flex gap-1 mt-1">
                              {s.user_roles?.map((r: any) => (
                                <Badge key={r.role} variant={r.role === 'gestao' ? 'default' : 'secondary'} className="text-[10px]">
                                  {r.role === 'professor' ? 'Professor' : 'Gestão'}
                                </Badge>
                              ))}
                              {!s.is_active && <Badge variant="outline" className="text-[10px] text-destructive border-destructive">Inativo</Badge>}
                            </div>
                          </div>
                          {s.is_active ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Inativar {s.full_name}?</AlertDialogTitle>
                                  <AlertDialogDescription>O usuário não poderá mais acessar o sistema.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleInactivateStaff(s.user_id)}>Inativar</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={async () => {
                                await supabase.from('profiles').update({ is_active: true }).eq('user_id', s.user_id);
                                toast({ title: 'Usuário reativado' });
                                fetchStaff();
                              }}>
                                Reativar
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" title="Apagar definitivamente">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Apagar {s.full_name} definitivamente?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Essa ação <strong>não pode ser desfeita</strong>. Todos os dados do usuário
                                      (perfil, login, papéis e vínculos) serão permanentemente removidos do banco.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteStaff(s.user_id, s.full_name)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Apagar definitivamente
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Horários da Fila Tab */}
            <TabsContent value="horarios" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" /> Horários da Fila do Banheiro
                  </CardTitle>
                  <CardDescription>
                    Escola: <strong>{selectedSchool.name}</strong> — defina os horários em que a fila ficará aberta, de segunda a sábado.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScheduleManager schoolId={selectedSchoolId} />
                </CardContent>
              </Card>
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
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default SuperAdminDashboard;
