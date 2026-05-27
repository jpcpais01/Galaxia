import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Player } from '@/types/game';

// Username-only auth: email and password are derived internally — never shown to the user.
function toEmail(username: string): string {
  return `${username.trim().toLowerCase()}@galaxia.local`;
}

// Deterministic internal password — user never sees this.
function toPassword(username: string): string {
  return `gx::${username.trim().toLowerCase()}::v1`;
}

interface AuthState {
  user: User | null;
  player: Player | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  enter:    (username: string) => Promise<void>; // register or login in one action
  signOut:  () => Promise<void>;
  init:     () => () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  player: null,
  loading: false,
  error: null,
  initialized: false,

  init: () => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        set({ user, player: snap.exists() ? (snap.data() as Player) : null, initialized: true });
      } else {
        set({ user: null, player: null, initialized: true });
      }
    });
    return unsub;
  },

  enter: async (username) => {
    set({ loading: true, error: null });

    const trimmed = username.trim();
    if (trimmed.length < 3)            { set({ loading: false, error: 'Username must be at least 3 characters' }); return; }
    if (trimmed.length > 20)           { set({ loading: false, error: 'Username must be 20 characters or less' }); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) { set({ loading: false, error: 'Letters, numbers, - and _ only' }); return; }

    const email    = toEmail(trimmed);
    const password = toPassword(trimmed);

    // Try login first (returning player)
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      set({ user: cred.user, player: snap.data() as Player, loading: false });
      return;
    } catch (e: any) {
      // Not registered yet — fall through to registration
      if (e.code !== 'auth/invalid-credential' && e.code !== 'auth/user-not-found') {
        set({ loading: false, error: 'Something went wrong. Try again.' });
        return;
      }
    }

    // Register new player
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: trimmed });

      const player: Player = {
        id: cred.user.uid,
        username: trimmed,
        gamesPlayed: 0,
        wins: 0,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, 'users', cred.user.uid), player);
      await setDoc(doc(db, 'usernames', trimmed.toLowerCase()), {
        username: trimmed.toLowerCase(),
        uid: cred.user.uid,
      });

      set({ user: cred.user, player, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.message ?? 'Could not create account' });
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null, player: null });
  },

  clearError: () => set({ error: null }),
}));
