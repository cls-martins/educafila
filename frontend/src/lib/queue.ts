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
  // Guard: if the user already has an active row, return it instead of duplicating.
  const { data: mine } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('classroom_id', classroomId)
    .eq('user_id', userId)
    .in('status', ['waiting', 'in_bathroom', 'called'] as any)
    .limit(1);
  if (mine && mine.length > 0) {
    return { data: mine[0], error: null };
  }

  // --- Stale queue guard ---------------------------------------------------
  // "Quando a fila encerra, remove todos; quando inicia, é uma nova fila."
  // Shared helper runs the check + wipe (called both here and periodically
  // by any connected dashboard client).
  try {
    await maybeWipeStaleQueue(classroomId, schoolId);
  } catch {
    // Best-effort cleanup; proceed regardless.
  }
  // -------------------------------------------------------------------------

  const { data: existing } = await supabase
    .from('queue_entries')
    .select('position')
    .eq('classroom_id', classroomId)
    .eq('school_id', schoolId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const insertRes = await supabase.from('queue_entries').insert({
    school_id: schoolId,
    classroom_id: classroomId,
    user_id: userId,
    position: nextPosition,
    status: 'waiting' as any,
  });

  // Restore the displayed penalty counter from the persistent `penalties`
  // history so it doesn't "disappear" when the student leaves & rejoins.
  try {
    await syncUserPenaltyCount(userId, schoolId);
  } catch {
    /* best-effort */
  }

  return insertRes;
}

/**
 * Wipe every queue_entry for a classroom. Used when the schedule closes so
 * the next open window starts with a fresh queue.
 */
export async function clearClassroomQueue(classroomId: string): Promise<void> {
  await supabase.from('queue_entries').delete().eq('classroom_id', classroomId);
}

/**
 * Check if the classroom's queue contains "stale" entries (joined before the
 * currently-open schedule window, or older than 10 minutes when no window is
 * open). If yes, wipe the entire classroom queue. Returns `true` when a wipe
 * actually happened so callers can refetch.
 *
 * Meant to be called periodically by any connected client (teacher or student)
 * so leftover entries from a previous session never carry over, even if the
 * schedule closed while nobody was online.
 */
export async function maybeWipeStaleQueue(
  classroomId: string,
  schoolId: string,
): Promise<boolean> {
  const { data: oldest } = await supabase
    .from('queue_entries')
    .select('joined_at')
    .eq('classroom_id', classroomId)
    .order('joined_at', { ascending: true })
    .limit(1);
  if (!oldest || oldest.length === 0) return false;
  const oldestTs = new Date(oldest[0].joined_at).getTime();
  const now = new Date();
  const { data: schedules } = await supabase
    .from('bathroom_schedules' as any)
    .select('weekday, start_time, end_time, is_active')
    .eq('school_id', schoolId)
    .eq('is_active', true);
  const jsDay = now.getDay();
  const weekday = jsDay === 0 ? null : jsDay;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const sToMin = (t: string) => {
    const [h, m] = t.split(':').map((n) => parseInt(n, 10));
    return h * 60 + m;
  };
  const currentWin = ((schedules ?? []) as any[]).find(
    (s) =>
      s.weekday === weekday &&
      sToMin(s.start_time) <= nowMin &&
      nowMin < sToMin(s.end_time),
  );
  let shouldWipe = false;
  if (currentWin) {
    const [sH, sM] = (currentWin.start_time as string).split(':').map(Number);
    const winStart = new Date(now);
    winStart.setHours(sH, sM, 0, 0);
    if (oldestTs < winStart.getTime()) shouldWipe = true;
  } else {
    // No open window right now — if any entry is older than 10 min, wipe.
    if (Date.now() - oldestTs > 10 * 60 * 1000) shouldWipe = true;
  }
  if (shouldWipe) {
    await supabase.from('queue_entries').delete().eq('classroom_id', classroomId);
    return true;
  }
  return false;
}

export async function leaveQueue(
  entryId: string,
  classroomId: string,
  schoolId: string
): Promise<void> {
  // Idempotent: delete the clicked entry AND any other active rows for the same user in this classroom.
  const { data: entry } = await supabase
    .from('queue_entries')
    .select('user_id')
    .eq('id', entryId)
    .maybeSingle();
  if (entry?.user_id) {
    await supabase
      .from('queue_entries')
      .delete()
      .eq('classroom_id', classroomId)
      .eq('user_id', entry.user_id);
  } else {
    await supabase.from('queue_entries').delete().eq('id', entryId);
  }
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
  reason: string,
  appliedBy?: string | null,
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
    applied_by: appliedBy ?? null,
  } as any);

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

  // Bump the display counter on the queue entry (best-effort).
  await supabase
    .from('queue_entries')
    .update({ penalty_count: (infractionNumber) as any })
    .eq('id', myEntry.id);

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

/**
 * Read the total number of penalties for a user in a school and mirror it into
 * any active `queue_entries.penalty_count` row for that user. Used so the
 * display counter never "disappears" when a student leaves and rejoins the
 * queue (the entry row is recreated but we restore the count from history).
 */
export async function syncUserPenaltyCount(
  userId: string,
  schoolId: string,
): Promise<number> {
  const { count } = await supabase
    .from('penalties')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('school_id', schoolId);
  const total = count ?? 0;
  await supabase
    .from('queue_entries')
    .update({ penalty_count: total } as any)
    .eq('user_id', userId)
    .eq('school_id', schoolId);
  return total;
}

/**
 * Remove a single penalty. After removing, resync the queue_entry counter so
 * the displayed count reflects the real history. Optionally revert the
 * student's position bump (best-effort — we leave queue position alone as
 * reshuffling mid-fila would be confusing).
 */
export async function removePenalty(penaltyId: string): Promise<void> {
  // Fetch the row first so we know which user/school to resync.
  const { data: row } = await supabase
    .from('penalties')
    .select('user_id, school_id')
    .eq('id', penaltyId)
    .maybeSingle();
  await supabase.from('penalties').delete().eq('id', penaltyId);
  if (row?.user_id && row?.school_id) {
    await syncUserPenaltyCount(row.user_id, row.school_id);
  }
}

/**
 * Apply a penalty to a student even when they are NOT in the queue. Uses the
 * same underlying `applyPenalty` logic but skips the queue-position bump when
 * the student has no active entry (the insertion of the `penalties` row is
 * what teachers/leaders/management care about here).
 */
export async function applyPenaltyStandalone(
  userId: string,
  classroomId: string,
  schoolId: string,
  reason: string,
  appliedBy?: string | null,
): Promise<void> {
  // applyPenalty already handles the "not in queue" case gracefully — it
  // returns early if no queue entry exists for the user. We still want the
  // `penalties` insert, the infraction_number and the penalty_percent math,
  // which applyPenalty does. So just reuse it.
  await applyPenalty(userId, classroomId, schoolId, reason, appliedBy ?? null);
  // Resync counter for any future queue entry (and any current one).
  await syncUserPenaltyCount(userId, schoolId);
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
