import { create } from 'zustand';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Player } from '@/types/game';

const LS_KEY = 'galaxia_uid';

function randomUid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Minimal shape so the rest of the app can still do user?.uid
interface SimpleUser { uid: string }

interface AuthState {
  user: SimpleUser | null;
  player: Player | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  init: () => Promise<void>;
  enter: (username: string) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  player: null,
  loading: false,
  error: null,
  initialized: false,

  init: async () => {
    if (typeof window === 'undefined') { set({ initialized: true }); return; }

    const uid = localStorage.getItem(LS_KEY);
    if (!uid) { set({ initialized: true }); return; }

    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        set({ user: { uid }, player: snap.data() as Player, initialized: true });
      } else {
        localStorage.removeItem(LS_KEY);
        set({ initialized: true });
      }
    } catch {
      set({ initialized: true });
    }
  },

  enter: async (username) => {
    set({ loading: true, error: null });

    const trimmed = username.trim();
    if (trimmed.length < 3)                 { set({ loading: false, error: 'At least 3 characters' }); return; }
    if (trimmed.length > 20)                { set({ loading: false, error: '20 characters max' }); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) { set({ loading: false, error: 'Letters, numbers, - and _ only' }); return; }

    const key = trimmed.toLowerCase();

    try {
      const usernameSnap = await getDoc(doc(db, 'usernames', key));

      if (usernameSnap.exists()) {
        // Username taken — log straight in as that player
        const { uid } = usernameSnap.data() as { uid: string };
        const playerSnap = await getDoc(doc(db, 'users', uid));
        const player = playerSnap.data() as Player;
        localStorage.setItem(LS_KEY, uid);
        set({ user: { uid }, player, loading: false });
      } else {
        // New username — claim it
        const uid = randomUid();
        const player: Player = {
          id: uid,
          username: trimmed,
          gamesPlayed: 0,
          wins: 0,
          createdAt: Date.now(),
        };

        await runTransaction(db, async (tx) => {
          const check = await tx.get(doc(db, 'usernames', key));
          if (check.exists()) throw new Error('Username just taken — try another');
          tx.set(doc(db, 'users', uid), player);
          tx.set(doc(db, 'usernames', key), { uid, username: trimmed });
        });

        localStorage.setItem(LS_KEY, uid);
        set({ user: { uid }, player, loading: false });
      }
    } catch (e: any) {
      set({ loading: false, error: e.message ?? 'Something went wrong' });
    }
  },

  signOut: () => {
    localStorage.removeItem(LS_KEY);
    set({ user: null, player: null });
  },

  clearError: () => set({ error: null }),
}));
