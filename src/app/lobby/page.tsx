'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import LobbyScreen from '@/components/lobby/LobbyScreen';

export default function LobbyPage() {
  const { user, initialized, init } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const unsub = init();
    return unsub;
  }, []);

  useEffect(() => {
    if (initialized && !user) router.replace('/');
  }, [initialized, user]);

  if (!initialized || !user) return null;
  return <LobbyScreen />;
}
