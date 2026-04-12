import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, GraduationCap, BookOpen, Shield, Settings, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import logo from '@/assets/educafila-logo.png';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [schoolPopoverOpen, setSchoolPopoverOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const fetchSchools = async () => {
      const { data } = await supabase.from('schools').select('id, name, city').order('name');
      if (data) setSchools(data);
    };
    fetchSchools();
  }, []);

  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.city.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  const handleLogin = async (e: React.FormEvent, expectedDomain?: string) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (expectedDomain && !trimmedEmail.endsWith(expectedDomain)) {
      toast({
        title: 'Email inválido',
        description: `Use um email ${expectedDomain}`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (error) {
      toast({
        title: 'Erro no login',
        description: 'Email ou senha incorretos.',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Login realizado!' });
      navigate('/dashboard');
    }
    setLoading(false);
  };

  const loginTabs = [
    { value: 'aluno', label: 'Aluno', icon: GraduationCap, domain: '@aluno.ce.gov.br', desc: 'Login com email institucional do aluno', showSchoolSearch: true },
    { value: 'professor', label: 'Professor', icon: BookOpen, domain: '@prof.ce.gov.br', desc: 'Login com email institucional do professor', showSchoolSearch: false },
    { value: 'gestao', label: 'Gestão', icon: Shield, domain: undefined, desc: 'Login para gestão e direção escolar', showSchoolSearch: false },
    { value: 'admin', label: 'Admin', icon: Settings, domain: undefined, desc: 'Painel de administração', showSchoolSearch: false },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="items-center text-center">
          <img src={logo} alt="EducaFila" width={80} height={80} className="mb-2" />
          <CardTitle className="text-2xl font-bold text-foreground">EducaFila</CardTitle>
          <CardDescription>Selecione seu tipo de acesso</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="aluno" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              {loginTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1 text-xs">
                  <tab.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {loginTabs.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                <form onSubmit={(e) => handleLogin(e, tab.domain)} className="space-y-4 pt-4">
                  <p className="text-xs text-muted-foreground">{tab.desc}</p>

                  {/* School search for students */}
                  {tab.showSchoolSearch && (
                    <div className="space-y-2">
                      <Label>Selecionar Escola</Label>
                      <Popover open={schoolPopoverOpen} onOpenChange={setSchoolPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                            type="button"
                          >
                            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                            {selectedSchool ? selectedSchool.name : 'Buscar escola...'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[350px] p-2" align="start">
                          <Input
                            placeholder="Digite o nome da escola ou cidade..."
                            value={schoolSearch}
                            onChange={(e) => setSchoolSearch(e.target.value)}
                            className="mb-2"
                          />
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {filteredSchools.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-2">Nenhuma escola encontrada</p>
                            ) : (
                              filteredSchools.slice(0, 20).map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-accent"
                                  onClick={() => {
                                    setSelectedSchool(s);
                                    setSchoolPopoverOpen(false);
                                    setSchoolSearch('');
                                  }}
                                >
                                  <p className="font-medium text-foreground">{s.name}</p>
                                  <p className="text-xs text-muted-foreground">{s.city}</p>
                                </button>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor={`email-${tab.value}`}>Email</Label>
                    <Input
                      id={`email-${tab.value}`}
                      type="email"
                      placeholder={tab.domain ? `seu.nome${tab.domain}` : 'seu@email.com'}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`pass-${tab.value}`}>Senha</Label>
                    <div className="relative">
                      <Input
                        id={`pass-${tab.value}`}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Entrando...' : 'Entrar'}
                  </Button>
                </form>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
