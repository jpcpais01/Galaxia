import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, query, collection, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Player } from '@/types/game';

interface AuthState {
  user: User | null;
  player: Player | null;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  register: (username: string, password: string) => Promise<void>;
  login:    (username: string, password: string) => Promise<void>;
  signOut:  () => Promise<void>;
  init:     () => () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  player: null,
  loading: false,
  error: null,
  initialized: false,

  init: () => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        set({ user, player: snap.data() as Player ?? null, initialized: true });
      } else {
        set({ user: null, player: null, initialized: true });
      }
    });
    return unsub;
  },

  register: async (username, password) => {
    set({ loading: true, error: null });
    try {
      // Check username availability
      const q = query(collection(db, 'usernames'), where('username', '==', username.toLowerCase()));
      const existing = await getDocs(q);
      if (!existing.empty) throw new Error('Username already taken');
      if (username.length < 3) throw new Error('Username must be at least 3 characters');
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) throw new Error('Username: letters, numbers, - and _ only');

      const email = `${username.toLowerCase()}@galaxia.local`;
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username });

      const player: Player = {
        id: cred.user.uid,
        username,
        gamesPlayed: 0,
        wins: 0,
        createdAt: Date.now(),
      };

      await setDoc(doc(db, 'users', cred.user.uid), player);
      await setDoc(doc(db, 'usernames', username.toLowerCase()), {
        username: username.toLowerCase(),
        uid: cred.user.uid,
      });

      set({ user: cred.user, player, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.message ?? 'Registration failed' });
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const email = `${username.toLowerCase()}@galaxia.local`;
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      set({ user: cred.user, player: snap.data() as Player ?? null, loading: false });
    } catch (e: any) {
      const msg = e.code === 'auth/invalid-credential' ? 'Invalid username or password' : e.message;
      set({ loading: false, error: msg });
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth);
    set({ user: null, player: null });
  },

  clearError: () => set({ error: null }),
}));
