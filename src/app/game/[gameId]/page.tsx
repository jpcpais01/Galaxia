'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import { useGameStore } from '@/store/game-store';
import GameScreen from '@/components/game/GameScreen';

export default function GamePage() {
  const params = useParams();
  const gameId = params.gameId as string;
  const router = useRouter();

  const { user, player, initialized, init } = useAuthStore();
  const { subscribeToGame, unsubscribe } = useGameStore();

  useEffect(() => {
    const unsub = init();
    return unsub;
  }, []);

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user]);

  useEffect(() => {
    if (!user || !gameId) return;
    const unsub = subscribeToGame(gameId, user.uid);
    return () => {
      unsub();
      unsubscribe();
    };
  }, [gameId, user?.uid]);

  if (!initialized || !user) return null;
  return <GameScreen />;
}
