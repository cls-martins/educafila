import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

const Unauthorized = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
    <ShieldAlert className="mb-4 h-16 w-16 text-destructive" />
    <h1 className="mb-2 text-2xl font-bold text-foreground">Acesso Negado</h1>
    <p className="mb-6 text-muted-foreground">Você não tem permissão para acessar esta página.</p>
    <Link to="/login">
      <Button>Voltar ao Login</Button>
    </Link>
  </div>
);

export default Unauthorized;
