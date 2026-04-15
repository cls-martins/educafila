import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GraduationCap, Users, Shield, BarChart3 } from 'lucide-react';
import heroImg from '@/assets/hero-bg.jpg';
import logo from '@/assets/educafila-logo.png';

const features = [
  {
    icon: GraduationCap,
    title: 'Para Alunos',
    desc: 'Entre na fila, acompanhe sua posição e vá ao banheiro com organização.',
  },
  {
    icon: Users,
    title: 'Para Professores',
    desc: 'Controle a fila da sala, aplique penalidades e monitore o tempo dos alunos.',
  },
  {
    icon: Shield,
    title: 'Para Gestão',
    desc: 'Dashboard com visão das 12 salas e alertas de tempo excedido.',
  },
  {
    icon: BarChart3,
    title: 'Escolas Profissionais',
    desc: 'Sistema escalável para todas as EEEPs do Estado do Ceará.',
  },
];

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${heroImg})` }}
        />
        <div className="gradient-hero absolute inset-0 opacity-90" />
        <div className="relative z-10 container mx-auto flex flex-col items-center justify-center px-4 py-20 text-center md:py-32">
          <img
            src={logo}
            alt="EducaFila"
            width={120}
            height={120}
            className="mb-6 drop-shadow-lg animate-fade-in"
          />
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-primary-foreground md:text-5xl lg:text-6xl animate-slide-up">
            EducaFila
          </h1>
          <p className="mb-2 text-lg text-primary-foreground/90 md:text-xl animate-slide-up">
            Gestão Inteligente de Filas Escolares
          </p>
          <p className="mb-8 max-w-2xl text-sm text-primary-foreground/75 md:text-base animate-slide-up">
            Sistema integrado para organização do uso do banheiro nas EEEPs do Ceará.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row animate-slide-up">
            <Link to="/login">
              <Button size="lg" className="min-w-[200px] bg-white text-primary font-bold text-base hover:bg-white/90 shadow-lg">
                Acessar Sistema
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-foreground md:text-3xl">
          Um sistema para todos
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-6 shadow-card transition-all hover:shadow-elevated hover:-translate-y-1"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-card-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-muted/50 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © 2026 EducaFila · Secretaria da Educação do Ceará (SEDUC)
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Sistema de gestão de filas para as EEEPs do Estado do Ceará
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
