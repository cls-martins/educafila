import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';

interface PenaltyReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  onConfirm: (reason: string) => void | Promise<void>;
  submitting?: boolean;
}

/**
 * Dialog used by the teacher/leader when applying a penalty. The writer is
 * required to provide a reason — it is stored on `penalties.reason` and will
 * be visible to (a) the penalized student and (b) any teacher through the
 * "Penalidades da Sala" menu.
 */
export const PenaltyReasonDialog: React.FC<PenaltyReasonDialogProps> = ({
  open,
  onOpenChange,
  studentName,
  onConfirm,
  submitting,
}) => {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const trimmed = reason.trim();
  const canSubmit = trimmed.length >= 3 && !submitting;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Aplicar penalidade
          </AlertDialogTitle>
          <AlertDialogDescription>
            Escreva o motivo da penalidade para{' '}
            <span className="font-semibold">{studentName || 'este aluno'}</span>.
            O aluno será recuado na fila e verá este motivo no painel dele.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="penalty-reason">Motivo</Label>
          <Textarea
            id="penalty-reason"
            data-testid="penalty-reason-input"
            placeholder="Ex: saiu sem permissão, ficou muito tempo no banheiro, conversas paralelas..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={300}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Mínimo 3 caracteres · {trimmed.length}/300
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="penalty-cancel-btn">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="penalty-confirm-btn"
            disabled={!canSubmit}
            onClick={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              void onConfirm(trimmed);
            }}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
          >
            <AlertTriangle className="mr-1 h-4 w-4" />
            Aplicar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PenaltyReasonDialog;
