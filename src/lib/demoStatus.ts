// Copy + predicates for the shared public demo account (Company.is_demo on the
// backend). Mirrors the web app's inline `isDemo` checks — web repeats its two
// tooltip strings as bare literals ~90 times across ~25 files; centralised here
// instead so app call sites share one source of truth. See src/hooks/useDemo.ts
// for the hook that reads the flags off the auth store.

/** Web's "Fixed in demo mode" — used for fixed seeded data (customers, drivers,
 *  vehicles, vehicle types) and every settings write. */
export const DEMO_FIXED_MESSAGE = 'Fixed in demo mode';

/** Web's "Not available in the demo" — used for integrations-adjacent and
 *  AI-execution actions that don't fit the "fixed data" framing. */
export const DEMO_UNAVAILABLE_MESSAGE = 'Not available in the demo';

/** Verbatim copy of the backend's QuoteViewSet.create 403 (core/views.py) so
 *  the proactive UI notice and the reactive error toast read identically. */
export const DEMO_QUOTA_MESSAGE =
  'You\'ve used this demo session\'s one free quote. Log out and log back in (or click "View Demo" again) to start a fresh session.';

/** Header badge, mirroring web's OSLayout.tsx pill. */
export const DEMO_BADGE_LABEL = 'DEMO';
export const DEMO_BADGE_DETAIL =
  'Shared public demo account — actions like emailing customers are simulated, not real.';

/** Shown in place of "no email on file" when a quote share is skipped because
 *  of demo mode rather than a missing customer email. */
export const DEMO_EMAIL_SIMULATED = 'Demo mode — link generated, no real email is sent.';

/** Shown when the demo credentials 401 because the shared demo company hasn't
 *  been seeded yet (it self-creates on Celery beat's first run). */
export const DEMO_UNAVAILABLE_LOGIN_MESSAGE =
  "The demo isn't available right now — please try again shortly.";
