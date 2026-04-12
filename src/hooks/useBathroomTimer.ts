import { useState, useEffect, useCallback, useRef } from 'react';
import { applyPenalty, finishBathroom } from '@/lib/queue';
import { useToast } from '@/hooks/use-toast';

const TIMER_LIMIT = 360;

interface UseBathroomTimerProps {
  isInBathroom: boolean;
  entryId: string | null;
  userId: string | null;
  classroomId: string | null;
  schoolId: string | null;
  onFinished: () => void;
}

export function useBathroomTimer({
  isInBathroom,
  entryId,
  userId,
  classroomId,
  schoolId,
  onFinished,
}: UseBathroomTimerProps) {
  const [timerSeconds, setTimerSeconds] = useState(0);
  const exceededRef = useRef(false);
  const { toast } = useToast();

  const handleExceeded = useCallback(async () => {
    if (exceededRef.current) return;
    exceededRef.current = true;

    if (!userId || !classroomId || !schoolId || !entryId) return;

    await applyPenalty(userId, classroomId, schoolId, 'Tempo excedido (6 min)');
    await finishBathroom(entryId, userId, classroomId, schoolId, TIMER_LIMIT, true);

    toast({
      title: 'Penalidade aplicada',
      description: 'Você excedeu o tempo de 6 minutos.',
      variant: 'destructive',
    });

    onFinished();
  }, [userId, classroomId, schoolId, entryId, toast, onFinished]);

  useEffect(() => {
    if (!isInBathroom) {
      setTimerSeconds(0);
      exceededRef.current = false;
      return;
    }

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        const next = prev + 1;
        if (next >= TIMER_LIMIT) {
          handleExceeded();
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isInBathroom, handleExceeded]);

  const resetTimer = useCallback(() => {
    setTimerSeconds(0);
    exceededRef.current = false;
  }, []);

  const timerWarning = timerSeconds >= 300;

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return {
    timerSeconds,
    timerWarning,
    formattedTime: formatTime(timerSeconds),
    resetTimer,
  };
}
