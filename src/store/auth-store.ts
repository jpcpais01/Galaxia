import { create } from 'zustand';
import {
  signInAnonymously,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Player } from '@/types/game';

interface AuthState {
  user: User | null;
  player: Player | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  needsUsername: boolean;        // anonymous session exists but no username claimed yet
  claimUsername: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
  init: () => () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  player: null,
  loading: false,
  error: null,
  initialized: false,
  needsUsername: false,

  init: () => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          set({ user, player: snap.data() as Player, initialized: true, needsUsername: false });
        } else {
          // Anonymous session exists but username not claimed yet
          set({ user, player: null, initialized: true, needsUsername: true });
        }
      } else {
        // No session at all — sign in anonymously so we have a UID ready
        try {
          await signInAnonymously(auth);
          // onAuthStateChanged will fire again with the new anonymous user
        } catch {
          set({ user: null, player: null, initialized: true, needsUsername: true });
        }
      }
    });
    return unsub;
  },

  claimUsername: async (username) => {
    const { user } = get();
    if (!user) return;

    set({ loading: true, error: null });

    const trimmed = username.trim();
    if (trimmed.length < 3)                     { set({ loading: false, error: 'At least 3 characters' }); return; }
    if (trimmed.length > 20)                    { set({ loading: false, error: '20 characters max' }); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed))     { set({ loading: false, error: 'Letters, numbers, - and _ only' }); return; }

    const usernameKey = trimmed.toLowerCase();

    try {
      // Atomically claim the username
      await runTransaction(db, async (tx) => {
        const usernameRef = doc(db, 'usernames', usernameKey);
        const existing = await tx.get(usernameRef);
        if (existing.exists()) throw new Error('Username already taken');

        const player: Player = {
          id: user.uid,
          username: trimmed,
          gamesPlayed: 0,
          wins: 0,
          createdAt: Date.now(),
        };

        tx.set(doc(db, 'users', user.uid), player);
        tx.set(usernameRef, { username: usernameKey, uid: user.uid });
      });

      const snap = await getDoc(doc(db, 'users', user.uid));
      set({ player: snap.data() as Player, loading: false, needsUsername: false });
    } catch (e: any) {
      set({ loading: false, error: e.message ?? 'Could not claim username' });
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
    // After sign-out, init will fire again and create a new anonymous session
    set({ user: null, player: null, needsUsername: true });
  },

  clearError: () => set({ error: null }),
}));
