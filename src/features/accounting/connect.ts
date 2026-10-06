import { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { WEB_APP_URL } from '@/lib/legal';
import { toast } from '@/lib/toast';
import { accountingApi, apiMessage, invalidateAccounting } from './api';
import { callbackMessage } from './copy';
import { providerBySlug, providerConfig, type ProviderCode, type ProviderSlug } from './types';

// Connecting an accounting system is an OAuth sign-in in the system browser.
// The backend sends the person back to the WEB settings page
// (core/accounting/views.py), not to the app, so the app can't read the result
// from a redirect on every OS: the sign-in runs in one auth session (the nonce
// cookie it sets must be in the same browser as the callback), and when that
// closes the app reads the result from the returned URL if it got one, and
// refetches the connection either way, which is the source of truth.

/** The web page the backend redirects to once the provider sign-in finishes. */
export const ACCOUNTING_RETURN_URL = `${WEB_APP_URL}/settings/integrations/accounting`;

export type CallbackBanner = NonNullable<ReturnType<typeof callbackMessage>>;

/** `?provider=&result=&reason=` from a returned URL, without relying on URL.searchParams. */
function readParam(url: string, name: string): string | null {
  const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' '));
  } catch {
    return m[1];
  }
}

export function parseCallbackUrl(url: string): CallbackBanner | null {
  const result = readParam(url, 'result');
  if (!result) return null;
  const provider = providerBySlug(readParam(url, 'provider')) ?? providerConfig('XERO');
  return callbackMessage(result, readParam(url, 'reason'), provider.short, provider.orgWord);
}

/**
 * Starts a provider's sign-in. `onBanner` gets the plain-words result when the
 * returned URL carried one (connected, choose an organisation, or why it
 * failed); the connection is refetched regardless.
 */
export function useConnectFlow(onBanner?: (b: CallbackBanner | null) => void) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<ProviderCode | null>(null);

  const connect = useCallback(
    async (slug: ProviderSlug) => {
      const cfg = providerBySlug(slug) ?? providerConfig('XERO');
      setBusy(cfg.code);
      try {
        const { auth_url } = await accountingApi.connect(slug);
        if (!auth_url) {
          toast.error(`Couldn't start the ${cfg.short} connection. Try again.`);
          return;
        }
        const res = await WebBrowser.openAuthSessionAsync(auth_url, ACCOUNTING_RETURN_URL);
        if (res.type === 'success' && res.url) onBanner?.(parseCallbackUrl(res.url));
      } catch (e) {
        toast.error(apiMessage(e, `Couldn't start the ${cfg.short} connection. Try again.`));
      } finally {
        setBusy(null);
        invalidateAccounting(qc);
      }
    },
    [onBanner, qc],
  );

  return { connect, busy };
}
