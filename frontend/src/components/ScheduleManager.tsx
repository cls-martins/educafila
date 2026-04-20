import React, { useEffect, useState, useCallback } from 'react';
import {
  BathroomSchedule,
  WEEKDAY_LABELS,
  deleteSchedule,
  fetchSchedules,
  upsertSchedule,
} from '@/lib/schedule';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Clock } from 'lucide-react';

interface Props {
  schoolId: string;
}

export const ScheduleManager: React.FC<Props> = ({ schoolId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<BathroomSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekday, setWeekday] = useState<number>(1);
  const [startT, setStartT] = useState('08:05');
  const [endT, setEndT] = useState('08:55');

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const data = await fetchSchedules(schoolId);
    setRows(data);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!startT || !endT || startT >= endT) {
      toast({
        title: 'Horário inválido',
        description: 'O horário final deve ser maior que o inicial.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    const { error } = await upsertSchedule({
      school_id: schoolId,
      weekday,
      start_time: startT,
      end_time: endT,
      is_active: true,
    });
    setLoading(false);
    if (error) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Horário adicionado' });
    await refresh();
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    const { error } = await deleteSchedule(id);
    setLoading(false);
    if (error) {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    await refresh();
  };

  const grouped: Record<number, BathroomSchedule[]> = {};
  for (const r of rows) {
    grouped[r.weekday] = grouped[r.weekday] || [];
    grouped[r.weekday].push(r);
  }

  return (
    <div className="space-y-6" data-testid="schedule-manager">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" /> Adicionar horário
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <Label className="text-xs">Dia da semana</Label>
            <Select value={String(weekday)} onValueChange={(v) => setWeekday(parseInt(v, 10))}>
              <SelectTrigger data-testid="schedule-weekday-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(WEEKDAY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Início</Label>
            <Input
              type="time"
              value={startT}
              onChange={(e) => setStartT(e.target.value)}
              data-testid="schedule-start-input"
            />
          </div>
          <div>
            <Label className="text-xs">Término</Label>
            <Input
              type="time"
              value={endT}
              onChange={(e) => setEndT(e.target.value)}
              data-testid="schedule-end-input"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleAdd}
              disabled={loading}
              className="w-full"
              data-testid="schedule-add-btn"
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {Object.keys(WEEKDAY_LABELS).map((k) => {
          const wd = parseInt(k, 10);
          const list = grouped[wd] || [];
          return (
            <div key={wd} className="rounded-lg border bg-card p-4">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-primary" />
                {WEEKDAY_LABELS[wd]}
                <span className="text-xs font-normal text-muted-foreground">
                  ({list.length} horário{list.length !== 1 ? 's' : ''})
                </span>
              </h4>
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum horário cadastrado.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {list.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-sm"
                      data-testid={`schedule-row-${r.id}`}
                    >
                      <span className="font-mono">
                        {r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}
                      </span>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={loading}
                        className="text-destructive hover:opacity-70"
                        aria-label="Remover"
                        data-testid={`schedule-delete-${r.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
