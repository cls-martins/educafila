import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Clock, LogIn, ArrowLeftRight, AlertTriangle, User, Moon, Smartphone } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const Item: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div className="flex gap-3">
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      {icon}
    </div>
    <div className="flex-1">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  </div>
);

export const HelpDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="help-dialog">
        <DialogHeader>
          <DialogTitle>Como usar o EducaFila</DialogTitle>
          <DialogDescription>
            Guia rápido para organizar o uso do banheiro na sua sala.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <Item icon={<Clock className="h-4 w-4" />} title="Horários da fila">
            A fila abre apenas nos horários definidos pela escola. Fora deles,
            o botão <b>Entrar na Fila</b> fica bloqueado e você vê o próximo
            horário disponível.
          </Item>
          <Item icon={<LogIn className="h-4 w-4" />} title="Entrar na fila">
            Toque em <b>Entrar na Fila</b> para entrar. Sua posição aparece
            no topo. Quando for a sua vez, toque em <b>Ir ao Banheiro</b>;
            ao voltar, toque em <b>Registrar Volta</b>.
          </Item>
          <Item icon={<ArrowLeftRight className="h-4 w-4" />} title="Trocar de lugar">
            Toque em <b>Trocar</b> para solicitar troca de posição com um
            colega. Ele recebe a notificação e decide aceitar ou recusar.
          </Item>
          <Item icon={<AlertTriangle className="h-4 w-4" />} title="Penalidades">
            Comportamento inadequado pode gerar penalidade, que empurra sua
            posição para trás (1ª = 30%, depois +10% cada). O contador
            aparece ao lado do seu nome na fila.
          </Item>
          <Item icon={<User className="h-4 w-4" />} title="Meu perfil">
            Em <b>Perfil</b> você escolhe pelo menos 2 nomes que ficarão
            visíveis na fila e a cor do seu nome. Branco é proibido (cor
            da fila — seu nome sumiria).
          </Item>
          <Item icon={<Moon className="h-4 w-4" />} title="Modo escuro">
            Use o botão <b>Modo Escuro</b> no menu para alternar o tema. A
            preferência é salva no seu perfil.
          </Item>
          <Item icon={<Smartphone className="h-4 w-4" />} title="Aplicativo">
            O app Android (.apk) pode ser baixado em <b>App</b>. Em breve!
          </Item>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const AppDownloadDialog: React.FC<Props> = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent data-testid="app-download-dialog">
      <DialogHeader>
        <DialogTitle>App EducaFila</DialogTitle>
        <DialogDescription>
          O aplicativo Android está sendo preparado.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Smartphone className="h-8 w-8 text-primary" />
        </div>
        <p className="text-sm font-semibold">Em breve</p>
        <p className="text-xs text-muted-foreground">
          Você poderá baixar o .apk direto por aqui. Enquanto isso, use o
          site no navegador do celular — funciona tudo igualzinho.
        </p>
      </div>
    </DialogContent>
  </Dialog>
);
