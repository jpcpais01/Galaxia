'use client';
import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useGameStore } from '@/store/game-store';
import { GAME_TICK_MS } from '@/lib/game/constants';

export function useGameLoop() {
  const { currentGame, myEmpire, empires, processTick } = useGameStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hbRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const amIHost = (): boolean => {
    if (!currentGame || !myEmpire) return false;
    if (currentGame.hostEmpireId === myEmpire.id) return true;
    const onlineHumans = empires
      .filter(e => !e.isBot && e.isOnline && Date.now() - e.lastSeen < 30_000)
      .sort((a, b) => a.id.localeCompare(b.id));
    return onlineHumans[0]?.id === myEmpire.id;
  };

  useEffect(() => {
    if (!currentGame || currentGame.status !== 'playing') return;

    const run = async () => {
      if (amIHost()) await processTick();
    };

    intervalRef.current = setInterval(run, GAME_TICK_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGame?.id, currentGame?.status, myEmpire?.id, empires.length]);

  useEffect(() => {
    if (!currentGame || !myEmpire) return;

    const gameId  = currentGame.id;
    const empireId = myEmpire.id;

    hbRef.current = setInterval(() => {
      updateDoc(doc(db, 'games', gameId, 'empires', empireId), {
        isOnline: true,
        lastSeen: Date.now(),
      }).catch(() => {});
    }, 15_000);

    return () => {
      if (hbRef.current) clearInterval(hbRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGame?.id, myEmpire?.id]);
}
