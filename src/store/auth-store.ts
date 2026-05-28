import { create } from 'zustand';
import { doc, getDoc, setDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Player, Civilization } from '@/types/game';

const LS_KEY = 'galaxia_uid';

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
  enter: (username: string, pin: string) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
  saveCivilization: (civ: Civilization) => Promise<void>;
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

  enter: async (username, pin) => {
    set({ loading: true, error: null });

    const trimmed = username.trim();
    if (trimmed.length < 3)                 { set({ loading: false, error: 'At least 3 characters' }); return; }
    if (trimmed.length > 20)                { set({ loading: false, error: '20 characters max' }); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) { set({ loading: false, error: 'Letters, numbers, - and _ only' }); return; }
    if (pin.length < 4)                     { set({ loading: false, error: 'PIN must be at least 4 characters' }); return; }

    const key    = trimmed.toLowerCase();
    const pinHash = await hashPin(pin);

    try {
      const usernameSnap = await getDoc(doc(db, 'usernames', key));

      if (usernameSnap.exists()) {
        // Username exists — verify PIN
        const { uid, pinHash: storedHash } = usernameSnap.data() as { uid: string; pinHash: string };
        if (pinHash !== storedHash) {
          set({ loading: false, error: 'Wrong PIN' });
          return;
        }
        const playerSnap = await getDoc(doc(db, 'users', uid));
        const player = playerSnap.data() as Player;
        localStorage.setItem(LS_KEY, uid);
        set({ user: { uid }, player, loading: false });
      } else {
        // New username — claim it with PIN
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
          tx.set(doc(db, 'usernames', key), { uid, username: trimmed, pinHash });
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

  saveCivilization: async (civ) => {
    const { player, user } = get();
    if (!player || !user) return;
    const updated: Player = { ...player, civilization: civ };
    await updateDoc(doc(db, 'users', user.uid), { civilization: civ });
    set({ player: updated });
  },
}));
