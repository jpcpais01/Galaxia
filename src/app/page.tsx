'use client';
export const dynamic = 'force-dynamic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import LoginScreen from '@/components/auth/LoginScreen';

export default function HomePage() {
  const { user, player, initialized, init } = useAuthStore();
  const router = useRouter();

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (initialized && user && player) router.replace('/lobby');
  }, [initialized, user, player]);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-space-900">
        <div className="font-pixel text-accent-cyan text-sm glow-text-cyan animate-pulse">
          INITIALIZING...
        </div>
      </div>
    );
  }

  return <LoginScreen />;
}
