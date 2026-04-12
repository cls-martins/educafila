import { supabase } from '@/integrations/supabase/client';

export type QueueStatus = 'waiting' | 'called' | 'in_bathroom' | 'finished' | 'penalized';

export interface QueueEntry {
  id: string;
  user_id: string;
  position: number;
  status: QueueStatus;
  joined_at: string;
  started_at?: string;
  penalties: number;
  school_id: string;
  classroom_id: string;
  profiles?: { full_name: string; avatar_url: string | null };
}

export async function enterQueue(
  userId: string,
  classroomId: string,
  schoolId: string
): Promise<{ data: any; error: any }> {
  const { data: existing } = await supabase
    .from('queue_entries')
    .select('position')
    .eq('classroom_id', classroomId)
    .eq('school_id', schoolId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  return supabase.from('queue_entries').insert({
    school_id: schoolId,
    classroom_id: classroomId,
    user_id: userId,
    position: nextPosition,
    status: 'waiting' as any,
  });
}

export async function leaveQueue(
  entryId: string,
  classroomId: string,
  schoolId: string
): Promise<void> {
  await supabase.from('queue_entries').delete().eq('id', entryId);
  await reorderQueue(classroomId, schoolId);
}

export async function reorderQueue(
  classroomId: string,
  schoolId: string
): Promise<void> {
  const { data: entries } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('classroom_id', classroomId)
    .eq('school_id', schoolId)
    .order('position', { ascending: true });

  if (!entries) return;

  for (let i = 0; i < entries.length; i++) {
    if (entries[i]) {
      await supabase
        .from('queue_entries')
        .update({ position: i + 1 })
        .eq('id', entries[i].id);
    }
  }
}

export async function startBathroom(
  entryId: string,
  userId: string,
  classroomId: string,
  schoolId: string
): Promise<void> {
  await supabase
    .from('queue_entries')
    .update({ status: 'in_bathroom' as any })
    .eq('id', entryId);

  await supabase.from('bathroom_logs').insert({
    school_id: schoolId,
    classroom_id: classroomId,
    user_id: userId,
  });
}

export async function finishBathroom(
  entryId: string,
  userId: string,
  classroomId: string,
  schoolId: string,
  durationSeconds: number,
  exceeded: boolean
): Promise<void> {
  const { data: logs } = await supabase
    .from('bathroom_logs')
    .select('id')
    .eq('user_id', userId)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1);

  if (logs?.[0]) {
    await supabase
      .from('bathroom_logs')
      .update({
        end_time: new Date().toISOString(),
        duration_seconds: durationSeconds,
        exceeded,
      })
      .eq('id', logs[0].id);
  }

  await supabase.from('queue_entries').delete().eq('id', entryId);
  await reorderQueue(classroomId, schoolId);
}

export async function applyPenalty(
  userId: string,
  classroomId: string,
  schoolId: string,
  reason: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('penalties')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('school_id', schoolId);

  const infractionNumber = (existing?.length ?? 0) + 1;
  const penaltyPercent = Math.min(30 + (infractionNumber - 1) * 10, 100);

  await supabase.from('penalties').insert({
    school_id: schoolId,
    user_id: userId,
    classroom_id: classroomId,
    reason,
    infraction_number: infractionNumber,
    penalty_percent: penaltyPercent,
  });

  const { data: queue } = await supabase
    .from('queue_entries')
    .select('id, position, user_id')
    .eq('classroom_id', classroomId)
    .eq('school_id', schoolId)
    .order('position', { ascending: true });

  if (!queue) return;

  const totalInQueue = queue.length;
  const myEntry = queue.find((e) => e.user_id === userId);
  if (!myEntry) return;

  const positionsToMove = Math.ceil(totalInQueue * (penaltyPercent / 100));
  const newPosition = Math.min(myEntry.position + positionsToMove, totalInQueue);

  if (newPosition <= myEntry.position) return;

  for (const entry of queue) {
    if (entry.position > myEntry.position && entry.position <= newPosition) {
      await supabase
        .from('queue_entries')
        .update({ position: entry.position - 1 })
        .eq('id', entry.id);
    }
  }

  await supabase
    .from('queue_entries')
    .update({ position: newPosition })
    .eq('id', myEntry.id);
}

export async function requestSwap(
  requesterId: string,
  targetId: string,
  classroomId: string,
  schoolId: string
): Promise<{ data: any; error: any }> {
  return supabase.from('swap_requests').insert({
    school_id: schoolId,
    classroom_id: classroomId,
    requester_id: requesterId,
    target_id: targetId,
  });
}

export async function respondToSwap(
  swapId: string,
  accepted: boolean,
  classroomId: string,
  schoolId: string
): Promise<void> {
  const status = accepted ? 'accepted' : 'rejected';

  await supabase
    .from('swap_requests')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', swapId);

  if (!accepted) return;

  const { data: swap } = await supabase
    .from('swap_requests')
    .select('requester_id, target_id')
    .eq('id', swapId)
    .single();

  if (!swap) return;
  const { requester_id, target_id } = swap as any;

  const { data: entries } = await supabase
    .from('queue_entries')
    .select('id, user_id, position')
    .eq('classroom_id', classroomId)
    .eq('school_id', schoolId)
    .in('user_id', [requester_id, target_id]);

  if (!entries || entries.length !== 2) return;

  const entryA = entries.find((e) => e.user_id === requester_id);
  const entryB = entries.find((e) => e.user_id === target_id);

  if (!entryA || !entryB) return;

  await supabase.from('queue_entries').update({ position: entryB.position }).eq('id', entryA.id);
  await supabase.from('queue_entries').update({ position: entryA.position }).eq('id', entryB.id);
}
