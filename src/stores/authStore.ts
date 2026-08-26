import { create } from 'zustand';
import { setAuthToken } from '@/lib/api/client';
import { storage } from '@/lib/storage';
import { queryClient } from '@/lib/queryClient';
import { authApi } from '@/features/auth/api';
import { unregisterPush } from '@/lib/push';
import type { AuthUser } from '@/types/auth';

// Client-side session state. Server data is owned by React Query; this store owns
// only identity: the DRF token + cached user + hydration status. Persistence is
// via SecureStore/AsyncStorage (see storage.ts).

type Status = 'loading' | 'authed' | 'guest';

// Both network steps in signOut() are already best-effort (swallowed on
// failure) — the local session clears either way. Cap the whole phase so a
// dead connection can't leave the sign-out spinner running for up to two
// stacked 30s axios timeouts; the user should reach Login promptly regardless.
const SIGN_OUT_NETWORK_MS = 8000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AuthState {
  status: Status;
  token: string | null;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: AuthUser) => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  token: null,
  user: null,

  // Boot: restore token/user so the app opens straight to the right stack.
  hydrate: async () => {
    const [token, user] = await Promise.all([storage.getToken(), storage.getUser()]);
    if (token) {
      setAuthToken(token);
      set({ token, user, status: 'authed' });
      // Sync fresh role/profile in the background (non-blocking).
      get().refreshUser();
    } else {
      set({ status: 'guest' });
    }
  },

  setSession: async (token, user) => {
    setAuthToken(token);
    await Promise.all([storage.setToken(token), storage.setUser(user)]);
    set({ token, user, status: 'authed' });
  },

  // Pull latest profile; ignore failures (a hard 401 is handled by the client).
  refreshUser: async () => {
    if (!get().token) return;
    try {
      const user = await authApi.me();
      await storage.setUser(user);
      set({ user });
    } catch {
      // swallow — background refresh
    }
  },

  signOut: async () => {
    // Drop the push registration FIRST, while the auth header is still valid —
    // otherwise this handset keeps receiving the previous user's notifications.
    // Both calls below are best-effort (already swallowed), so race the whole
    // phase against a timeout — a slow/dead network still clears locally and
    // lands the user on Login within SIGN_OUT_NETWORK_MS.
    const networkPhase = (async () => {
      try {
        await unregisterPush();
      } catch {
        // never block sign-out on it
      }
      try {
        await authApi.logout();
      } catch {
        // revoking server-side is best-effort; always clear locally
      }
    })();
    await Promise.race([networkPhase, delay(SIGN_OUT_NETWORK_MS)]);
    setAuthToken(null);
    await storage.clear();
    // Wipe every cached server response. Without this the next user to sign in
    // on this handset sees the previous user's quotes/invoices/customers until
    // each key refetches — gcTime is 30 minutes.
    queryClient.clear();
    set({ token: null, user: null, status: 'guest' });
  },
}));

// Called by the API client on an unexpected 401 (expired/revoked token).
// The token is already dead, so the unregister DELETE would fail — clear the
// local FCM token anyway so a stale install stops receiving pushes.
export const forceSignOut = () => {
  setAuthToken(null);
  void unregisterPush().catch(() => {});
  void storage.clear();
  queryClient.clear();
  useAuthStore.setState({ token: null, user: null, status: 'guest' });
};
