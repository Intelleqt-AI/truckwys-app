# Truckwys Mobile

Production-ready **React Native (Expo)** app for the Truckwys road-freight platform — iOS + Android. Matches the Claude Design "operations terminal" design system and reaches feature parity with the web frontend (`../truckwyas-frontend`), talking to the Django REST API (`../truckwys-backend`).

- **Expo SDK 57** · React Native 0.86 · React 19 · TypeScript (strict)
- **NativeWind v4** (Tailwind) — dark-first theme with OS light/dark
- **TanStack Query v5** (server state) + **Zustand** (auth/session)
- **React Navigation 7** (native-stack + bottom-tabs)
- **React Hook Form + Zod** (forms) · **Reanimated** (motion) · **FlashList** (lists)
- **Axios** centralized client · **expo-secure-store** (token) · **lucide-react-native** (icons)

## Quick start

```bash
cd truckwys-mobile
npm install
npm start            # Expo dev server — scan the QR with Expo Go (iOS/Android)
# or
npm run ios          # open iOS simulator
npm run android      # open Android emulator
```

Runs in **Expo Go** — no custom native module, so no dev build needed for development.

### Environment

`EXPO_PUBLIC_API_URL` points at the Django API. The client normalizes it to the
`…/api/v1/` root, so either the host root or the full prefix works.

```
# .env  (copy from .env.example)
EXPO_PUBLIC_API_URL=https://web-production-143e2.up.railway.app/
```

For a **local backend on a physical device**, use your machine's LAN IP (not `localhost`):

```
EXPO_PUBLIC_API_URL=http://192.168.x.x:8001/
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Expo dev server |
| `npm run ios` / `android` | Launch on simulator/emulator |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |

## Architecture

Feature-based, with a clear separation of UI / screens / hooks / API / state.

```
src/
  theme/          tokens.ts (design tokens), ThemeProvider (OS light/dark)
  navigation/     RootNavigator (auth gate), AppNavigator (tabs + modals),
                  AuthStack, AppTabs, TabBar, useAppNavigation, types
  lib/
    api/          client.ts (axios + Token interceptor + 401 handler),
                  hooks.ts (useFetch/usePost/usePatch), list.ts (helpers)
    formatters.ts ZAR/date/number formatting (ported from web)
    storage.ts    SecureStore (token) + AsyncStorage (user cache)
    queryClient   TanStack Query config
    toast         global toast host
  stores/         authStore.ts (Zustand — token/user/status)
  components/
    ui/           design-system primitives (Button, Card, StatusPill,
                  TextField, StatCard, ListRow, EmptyState, SheetScreen, …)
    feedback.tsx  skeletons + error states
    ErrorBoundary.tsx
  types/          auth.ts, domain.ts (normalizers for loosely-typed API data)
  features/
    auth/         Login, VerifyOtp (2FA), Signup, ForgotPassword
    home/         Overview dashboard
    bookings/     Quotes/Orders/History, Load/Quote detail, Create-Quote wizard
    fleet/        Vehicles/Drivers + detail
    finance/      Invoices/Expenses/Reports + Invoice detail
    customers/    list / detail (+ risk) / add
    more/         profile, Insights, Fast-Pay Capital, Copilot, Activity,
                  Notifications, Settings (all sections)
```

### Authentication (DRF per-device Token — not JWT)

- `POST auth/login/` → `{token,user}` **or** `{otp_required, pending_token, email}`
- `POST auth/login/verify-otp/` `{pending_token, code}` → `{token,user}`
- `Authorization: Token <key>` header on every request (see `lib/api/client.ts`)
- Token in Keychain/Keystore via SecureStore; user profile cached in AsyncStorage
- No refresh token — an unexpected 401 clears the session and returns to Login
- `GET auth/me/` hydrates profile on boot; `POST auth/logout/` revokes the device

### Design system

Tokens are lifted verbatim from the Claude Design project (`88c3aace…`):
near-black surfaces, single blue accent (`#4D9EFF`), monospace for every
number/label/ID, 2px "near-sharp" radii, hairline borders, one ambient glow,
a single pulsing live dot. Money is **ZAR** (`R 48,200.00`, `en-ZA`), never
abbreviated; dates/numbers use `en-GB`. Light theme mirrors every role and
follows the OS setting.

## Build & publish (EAS)

Install the CLI and link the project once:

```bash
npm install -g eas-cli
eas login
eas init            # writes the EAS projectId
```

`eas.json` defines three profiles (`development`, `preview`, `production`), each
setting `EXPO_PUBLIC_API_URL`.

```bash
# Internal test builds (installable on device / simulator)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Store builds
eas build --profile production --platform ios
eas build --profile production --platform android

# Submit to the stores
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Before the first store submission, set in `app.config.ts` / EAS:
- iOS `bundleIdentifier` + Apple Developer team & App Store Connect app
- Android `package` + Play Console app + upload keystore (EAS-managed)
- Replace the placeholder `assets/icon.png` / `assets/splash-icon.png` with the
  1024×1024 Truckwys icon and splash artwork.

## App Store readiness

- No runtime permissions requested (routes are schematic strips, not live maps)
- Graceful loading (skeletons), empty and error states everywhere; offline-safe
- `console.*` stripped in production builds (`babel.config.js` env)
- Hermes engine; FlashList for long lists; memoized rows; `expo-image` caching
- Top-level `ErrorBoundary` prevents white-screen crashes
- Dark-first UI following Apple Human Interface Guidelines; ≥44px tap targets

## Notes / assumptions

- A few write endpoints (send quote, convert-to-invoice, POD upload, advance
  request) call the most likely Django routes and fail soft; confirm exact paths
  against `../truckwys-backend/core/urls.py` or `/api/docs/` and adjust in the
  relevant `features/*/api.ts` if needed.
- Loosely-typed API responses are read defensively via `types/domain.ts`
  normalizers (`pick`/`num`/`str`), tolerant of field-name drift.
