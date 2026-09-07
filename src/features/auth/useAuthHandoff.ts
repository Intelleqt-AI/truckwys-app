import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { authApi } from './api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/toast';

// Web -> app auth handoff. Lets someone who just registered or signed in on
// truckwys.com (typically on their phone) land in the app already
// authenticated, instead of switching over and retyping their credentials.
//
// This is deliberately a *receiver*, not a call-to-action: the app never
// opens a browser or initiates anything (contrast WebBrowser.openAuthSessionAsync
// elsewhere in the app). The web page decides when to show its own
// "Open in the Truckwys app" button and links to
// truckwys://auth/callback?code=<one-time code>; this hook only reacts to
// that link arriving. See the plan notes on why the app's own UI must not
// change for this — App Store 3.1.1 outside the US storefront.
//
// Handled directly via expo-linking rather than React Navigation's `linking`
// config so it works while signed out — RootNavigator deliberately disables
// that config until status === 'authed'.
export function useAuthHandoff() {
  const status = useAuthStore((s) => s.status);
  const setSession = useAuthStore((s) => s.setSession);
  // Codes already attempted this app session, so a re-delivered event (e.g.
  // the same cold-start URL surfacing twice) can't double-exchange a code
  // that already failed, and can't retry a code the server already burned.
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      // Already inside the app — a stray/late handoff link is a no-op, never
      // a session swap out from under whoever is currently signed in.
      if (useAuthStore.getState().status === 'authed') return;

      let parsed: Linking.ParsedURL;
      try {
        parsed = Linking.parse(url);
      } catch {
        return;
      }
      // truckwys://auth/callback?code=... -> hostname 'auth', path 'callback'.
      if (parsed.hostname !== 'auth' || parsed.path !== 'callback') return;

      const code = parsed.queryParams?.code;
      if (typeof code !== 'string' || !code || attempted.current.has(code)) return;
      attempted.current.add(code);

      void (async () => {
        try {
          const { token, user } = await authApi.exchangeHandoff(code);
          await setSession(token, user);
        } catch {
          // Expired (>60s), already used, or offline — the code is single-use
          // server-side regardless, so there's nothing to retry. Send them to
          // the normal form instead of failing silently.
          toast.error('That link has expired. Please sign in below.');
        }
      })();
    };

    void Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [setSession]);

  // Exposed only so RootNavigator can order this before the loading gate;
  // the hook itself is side-effect only.
  return status;
}
