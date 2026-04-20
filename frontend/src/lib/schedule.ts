import { supabase } from '@/integrations/supabase/client';

export interface BathroomSchedule {
  id: string;
  school_id: string;
  weekday: number; // 1=Mon ... 6=Sat
  start_time: string; // 'HH:MM:SS' or 'HH:MM'
  end_time: string;
  is_active: boolean;
}

export interface ScheduleStatus {
  open: boolean;
  current?: { start: string; end: string };
  next?: { start: string; end: string };
  all: Array<{ start: string; end: string }>;
}

export async function fetchSchedules(schoolId: string): Promise<BathroomSchedule[]> {
  const { data, error } = await supabase
    .from('bathroom_schedules' as any)
    .select('*')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as BathroomSchedule[];
}

export async function upsertSchedule(row: {
  id?: string;
  school_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}): Promise<{ error: any }> {
  if (row.id) {
    const { error } = await supabase
      .from('bathroom_schedules' as any)
      .update({
        weekday: row.weekday,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: row.is_active ?? true,
      })
      .eq('id', row.id);
    return { error };
  }
  const { error } = await supabase.from('bathroom_schedules' as any).insert({
    school_id: row.school_id,
    weekday: row.weekday,
    start_time: row.start_time,
    end_time: row.end_time,
    is_active: row.is_active ?? true,
  });
  return { error };
}

export async function deleteSchedule(id: string): Promise<{ error: any }> {
  const { error } = await supabase.from('bathroom_schedules' as any).delete().eq('id', id);
  return { error };
}

function toHHMM(t: string): string {
  // accepts 'HH:MM' or 'HH:MM:SS'
  return t.slice(0, 5);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export function computeStatus(schedules: BathroomSchedule[], now = new Date()): ScheduleStatus {
  // JS getDay(): 0=Sun,1=Mon,...6=Sat. We store weekday 1..6 (Mon..Sat).
  const jsDay = now.getDay();
  const weekday = jsDay === 0 ? null : jsDay; // sunday -> no queue
  const todays = (schedules ?? [])
    .filter((s) => s.weekday === weekday)
    .map((s) => ({ start: toHHMM(s.start_time), end: toHHMM(s.end_time) }))
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const current = todays.find(
    (s) => timeToMinutes(s.start) <= nowMin && nowMin < timeToMinutes(s.end),
  );
  const next = todays.find((s) => timeToMinutes(s.start) > nowMin);
  return { open: !!current, current, next, all: todays };
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};
