// Canonical Truckwys hosts and legal URLs. Every outbound link and shared URL
// in the app resolves from here, so a domain change is a one-file edit.

/** Marketing site — where accounts are created and the legal pages live. */
export const SITE_URL = 'https://www.truckwys.com';

/** Web dashboard — the authenticated app, used for client-facing share links. */
export const WEB_APP_URL = 'https://app.truckwys.com';

// App Store Review 5.1.1 requires a reachable privacy policy for any app with
// user accounts. Both pages must be LIVE at review time — a 404 here is a
// rejection. The same URLs go into App Store Connect.
// Linked from the sign-in screen (reachable without an account) and More → Support.
export const PRIVACY_POLICY_URL = `${SITE_URL}/privacy`;
export const TERMS_URL = `${SITE_URL}/terms`;

export const SUPPORT_EMAIL = 'support@truckwys.com';

/** Public, tokenised quote view a customer can open without signing in. */
export const quoteShareUrl = (id: string | number, token: string) =>
  `${WEB_APP_URL}/quotes/view/${id}/${token}`;

/** Public, tokenised invoice view. */
export const invoiceShareUrl = (id: string | number, token: string) =>
  `${WEB_APP_URL}/invoice/view/${id}/${token}`;
