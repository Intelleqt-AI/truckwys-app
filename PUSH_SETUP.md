# Push notification setup — Truckwys

Everything in the code is done. What remains is account setup that needs your
logins. Work through this top to bottom.

**Start with Android.** It needs no Apple Developer account, so you can prove the
whole pipeline end-to-end today — device → backend → FCM → notification on a
locked phone. Once that works, iOS is only the APNs key (Part D) plus a rebuild.

Bundle identifier / package name, used in several places below and it must match
exactly: **`za.co.truckwys.mobile`**

---

## Part A — Link the EAS project ✅ DONE

`eas init` was run once and created `@iamsaif5/truckwys-mobile` — a project
under a personal account. Turned out there was already a **separate, older
project, `@intelleqt/truckwys`**, linked via a GitHub integration to this repo
(`Intelleqt-AI/truckwys-app`) and used for the real STORE/production build
attempts. Two projects for one app is a trap — a build triggered through the
GitHub integration and one triggered from a local `eas build` would silently
use different projects, different secrets, different push tokens.

**Consolidated on `@intelleqt/truckwys`** (the org one — it's the one already
wired to real builds):

```
slug: 'truckwys'                                          // must match exactly
projectId: '0ef68ce5-03e0-46d7-b4c4-6fc1a9c5f170'
```

Both are set in `app.config.ts`. The `slug` field isn't cosmetic here — EAS
hard-errors (`project:info command failed`) if it doesn't match the project's
real slug once a `projectId` is set. Verify either any time with:
```bash
npx eas-cli project:info
```
should print `fullName  @intelleqt/truckwys`.

The abandoned `@iamsaif5/truckwys-mobile` project still exists on EAS with a
duplicate copy of the Firebase secrets (Part C) — harmless, but worth deleting
later via the Expo dashboard to avoid confusing a future you.

---

## Part B — Create the Firebase project and its two apps ✅ DONE

Project **`truckwys`** created (with Analytics). Both apps registered under
bundle/package `za.co.truckwys.mobile`:

- iOS → `GoogleService-Info.plist` downloaded, `PROJECT_ID: truckwys`,
  `BUNDLE_ID: za.co.truckwys.mobile` confirmed
- Android → `google-services.json` downloaded, `project_id: truckwys`,
  `package_name: za.co.truckwys.mobile` confirmed

Both files sit in the repo root (next to `app.config.ts`) and `.env` points at
them:

```
GOOGLE_SERVICES_INFO_PLIST=./GoogleService-Info.plist
GOOGLE_SERVICES_JSON=./google-services.json
```

Verified `npx expo config --type public` resolves both `googleServicesFile`
paths correctly. Both filenames are gitignored — never commit them.

---

## Part C — Give the cloud builds those two files ✅ DONE

EAS builds run on Expo's machines and never see your local files. Uploaded both
as **file-type** environment variables — EAS exposes a path at build time, which
is exactly what `googleServicesFile` expects — to **all three** environments
(`development`, `preview`, `production`):

```bash
npx eas-cli env:create <environment> \
  --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
  --visibility sensitive --scope project

npx eas-cli env:create <environment> \
  --name GOOGLE_SERVICES_INFO_PLIST --type file --value ./GoogleService-Info.plist \
  --visibility sensitive --scope project
```

Confirmed present (masked, as expected for `sensitive`) via:
```bash
npx eas-cli env:list --environment development
npx eas-cli env:list --environment preview
npx eas-cli env:list --environment production
```

Verified the actual file *content* too (`--include-file-content`), not just
presence — both match your real Firebase app exactly:
`project_id: truckwys`, `package_name` / `BUNDLE_ID: za.co.truckwys.mobile`.
One thing to revisit later, unrelated to push: the iOS plist has
`IS_ANALYTICS_ENABLED: false` — worth turning on in the Firebase console if
per-platform Analytics matters to you (it doesn't block anything here).

> **Note:** by the time this was checked, all six secrets already existed on
> **`@intelleqt/truckwys`** (not only the personal project the commands above
> were run against) — content-verified identical, not just same-named. Exactly
> why isn't fully pinned down; treat it as confirmed-correct rather than
> mysterious, but if you ever see stale Firebase config in a build, re-check
> both projects rather than assuming.

---

## Build failure: `npm ci` lock file out of sync ✅ FIXED (on this branch)

A STORE build on `@intelleqt/truckwys` failed in `INSTALL_DEPENDENCIES`:
```
npm error `npm ci` can only install packages when your package.json and
package-lock.json ... are in sync.
npm error Missing: @emnapi/core@1.11.3 from lock file
npm error Missing: @emnapi/runtime@1.11.3 from lock file
npm error Invalid: lock file's @emnapi/wasi-threads@1.2.2 does not satisfy ...@1.2.3
```

**Unrelated to Firebase/push** — it built off `main` at the commit before any
of this work started, and `main`'s `package-lock.json` was already drifted from
`package.json` (a transitive-dependency lock corruption, not something either
of us touched). `npm ci` enforces byte-exact sync and refuses to reconcile it;
`npm install` does.

This branch's lock file is already healthy — the several `npx expo install`
calls made while adding the push/map dependencies regenerated it as a side
effect. Confirmed with a dry run:
```bash
npm ci --include=dev --dry-run   # → "up to date", no errors
```

**`main` itself is still broken** until this branch merges. If a build needs to
run off `main` before that, someone needs to run `npm install` there and commit
the regenerated `package-lock.json` — a small, separate fix, not bundled into
this branch's diff.

---

## Part D — APNs key (iOS only, needs the Apple Developer account)

Skip until the account is live. Android push works without any of this.

**1. Create the key** — <https://developer.apple.com/account> → Certificates,
Identifiers & Profiles → **Keys** → **+**

- Name: `Truckwys APNs`
- Tick **Apple Push Notifications service (APNs)**
- Continue → Register → **Download**

> The `.p8` file downloads **once**. Apple will never let you download it again.
> Save it somewhere permanent before you close that tab.

Note two values while you're there:
- **Key ID** — 10 characters, shown on the key's page
- **Team ID** — 10 characters, top-right of the developer portal (also under
  Membership)

**2. Upload it to Firebase, not EAS.** This is the step people get wrong. We
send through FCM, so FCM is what needs to talk to APNs on our behalf:

Firebase console → ⚙ **Project settings** → **Cloud Messaging** tab → under
**Apple app configuration**, find your iOS app → **APNs authentication key** →
**Upload** → select the `.p8`, enter the Key ID and Team ID.

**3. Confirm push is enabled on the App ID.** In the Apple portal under
Identifiers → `za.co.truckwys.mobile`, **Push Notifications** should be
enabled. EAS normally turns this on automatically because our
`app.config.ts` declares the `aps-environment` entitlement; if it isn't ticked,
tick it and save.

---

## Part E — Backend

**1. Service account key.** Firebase console → ⚙ Project settings →
**Service accounts** → **Generate new private key** → downloads a JSON file.

> This key can send push as your entire Firebase project. Treat it like a
> password: environment or secret manager only, never in git. The repo's
> `.gitignore` already blocks the usual filenames.

**2. Configure.** Set **one** of these in the backend environment:

```
FIREBASE_CREDENTIALS=/absolute/path/to/serviceAccountKey.json
```
or, on a host with no writable disk (Railway, Heroku), paste the whole JSON as a
single-line value:
```
FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"...", ...}
```

With both blank, push silently does nothing — by design, so a misconfigured
environment degrades instead of erroring.

**3. Install and migrate:**

```bash
cd truckwys-backend
pip install -r requirements.txt      # adds firebase-admin
python manage.py migrate             # creates the fcm_devices table
```

**4. Restart the server.**

---

## Part F — Verify, in order

### F1. Quickest possible check — Firebase console direct to device

Build and install a dev client, sign in, accept the notification prompt:

```bash
npx eas-cli build --profile development --platform android
```

Grab the device's token from the database:

```bash
python manage.py shell -c "from core.models import FcmDevice; print(FcmDevice.objects.values_list('token', flat=True))"
```

A row existing at all proves permission → token → registration all worked.

Then Firebase console → **Messaging** → **Send test message**, paste the token.
If that notification arrives, Firebase → device is proven and anything that
fails later is our backend, not the plumbing.

### F2. Real event through the backend

```bash
python manage.py shell
```
```python
from core.models import User
from core.services.fcm_push import fcm_configured, send_fcm
u = User.objects.get(email="you@example.com")
print("configured:", fcm_configured())        # must be True
print("sent to N devices:", send_fcm(u, {
    "title": "Load delivered",
    "message": "TW-1042 · Johannesburg → Cape Town",
    "link": "/bookings/12",
    "type": "success",
}))
```

`sent to N devices: 1` means it left the building. Then test the whole funnel,
which is what every real event uses:

```python
from core.services.notify import notify_company
notify_company(u.company_id, "SUCCESS", "Load delivered",
               "TW-1042 arrived", "/bookings/12", event="booking.delivered")
```

### F3. The three states that matter

Test each deliberately — they use different code paths:

| State | Expected |
|---|---|
| App **open** | Banner appears, the bell badge and notification list update immediately |
| App **backgrounded** | OS notification; tapping it opens the right detail screen |
| App **force-quit** | Notification still arrives; tapping cold-starts into the right screen |

The third one is the actual requirement — "notifications even when the app is
closed". If 1 and 2 work but 3 doesn't, the background handler registration in
`App.tsx` is the place to look.

Finally: **sign out**, confirm the `FcmDevice` row is deleted, and confirm no
further notifications reach that handset.

### F4. iOS extras once the Apple account is in

- Real device only. The iOS Simulator cannot receive remote push.
- Rebuild after uploading the APNs key: `npx eas-cli build --profile development --platform ios`

---

## Ordered checklist

- [x] A. `eas login && eas init`; consolidated onto `@intelleqt/truckwys` (the GitHub-linked org project) after finding two projects existed for one app
- [x] B. Firebase project `truckwys` created with Analytics; iOS + Android apps added; both config files in the repo root; paths in `.env`
- [x] C. Both config files uploaded as EAS file env vars to all three environments on `@intelleqt/truckwys`, content-verified
- [x] npm ci lock-file drift fixed on this branch (unrelated pre-existing bug); `main` still needs it separately
- [ ] D. *(after Apple account)* APNs `.p8` created, uploaded to **Firebase** with Key ID + Team ID
- [x] E. Service account key set as `FIREBASE_CREDENTIALS`; `firebase-admin` installed; `migrate` applied; Firebase app confirmed initializing
- [ ] F. Android dev build verified across all three app states, then iOS

---

## Not push, but same submission

- [ ] Publish the privacy and terms pages, then set the real URLs in `src/lib/legal.ts`
- [ ] Create the reviewer demo account with representative data and enter the credentials in App Store Connect → App Review Information. **The app is sign-in only — without this a reviewer cannot get past the login screen.**
- [ ] Fill `submit.production` in `eas.json` with `appleId`, `ascAppId`, `appleTeamId`
- [ ] Confirm the web dashboard host is `app.truckwys.com` (assumed in `src/lib/legal.ts`)
