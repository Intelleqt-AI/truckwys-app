import { useQuery } from '@tanstack/react-query';
import { fetchData, patchData, postData } from '@/lib/api/client';
import type {
  FollowUpState,
  FuelAdjustment,
  FuelAlert,
  PricingSetup,
  QuoteAutomation,
  ReminderPreview,
} from '@/lib/followups';

// Quote follow-ups API (FOLLOWUPS-CLIENT-SPEC.md). Every endpoint is under
// /api/v1/ and scoped to the user's company. Errors come back as
// {success: false, code, message}; the client surfaces `message` as the
// Error's text and keeps the body on `.data`.

/** Company switches: GET for anyone, PATCH for admins (403 otherwise). */
export function useQuoteAutomation(enabled = true) {
  return useQuery<QuoteAutomation>({
    queryKey: ['quote-automation'],
    queryFn: () => fetchData<QuoteAutomation>('company/quote-automation/'),
    enabled,
    retry: false,
  });
}

export const patchQuoteAutomation = (data: Partial<QuoteAutomation>) =>
  patchData<QuoteAutomation>({ url: 'company/quote-automation/', data });

export function usePricingSetup(enabled = true) {
  return useQuery<PricingSetup>({
    queryKey: ['pricing-setup'],
    queryFn: () => fetchData<PricingSetup>('company/pricing-setup/'),
    enabled,
    retry: false,
  });
}

export const postPricingSetup = (
  data: { action: 'confirm'; keys: string[] } | { action: 'dismiss' },
) => postData<PricingSetup>({ url: 'company/pricing-setup/', data });

/** The clause / adjustment for a quote, or the load it became. Null on failure (advice, not a figure). */
export function useFuelAdjustment(kind: 'quotes' | 'loads', id: string | number, enabled: boolean) {
  return useQuery<FuelAdjustment | null>({
    queryKey: ['fuel-adjustment', kind, id],
    enabled: enabled && !!id,
    retry: false,
    queryFn: async () => {
      try {
        return await fetchData<FuelAdjustment>(`${kind}/${id}/fuel-adjustment/`);
      } catch {
        return null;
      }
    },
  });
}

export function useFuelAlert(id: string | number) {
  return useQuery<FuelAlert>({
    queryKey: ['fuel-alert', id],
    queryFn: () => fetchData<FuelAlert>(`fuel-alerts/${id}/`),
    enabled: !!id,
    retry: false,
  });
}

export function useFollowUp(id: string | number, enabled: boolean) {
  return useQuery<FollowUpState>({
    queryKey: ['quote-follow-up', id],
    queryFn: () => fetchData<FollowUpState>(`quotes/${id}/follow-up/`),
    enabled: enabled && !!id,
    retry: false,
  });
}

/** Step 1: the preview. Nothing is sent. */
export function useReminderPreview(id: string | number, note: string, enabled: boolean) {
  return useQuery<ReminderPreview>({
    queryKey: ['quote-follow-up', id, 'reminder', note],
    queryFn: () =>
      fetchData<ReminderPreview>(
        `quotes/${id}/follow-up/reminder/${note ? `?note=${encodeURIComponent(note)}` : ''}`,
      ),
    enabled: enabled && !!id,
    retry: false,
    // Keep the last preview on screen while a new note is fetched.
    placeholderData: (prev) => prev,
    staleTime: 0,
  });
}

/** Step 2: the explicit send. */
export const sendReminder = (id: string | number, note: string) =>
  postData<FollowUpState & { success: boolean; sent_to: string }>({
    url: `quotes/${id}/follow-up/reminder/`,
    data: { confirm: true, note },
  });
