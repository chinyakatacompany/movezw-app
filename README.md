# MoveZW

A React + Vite PWA for booking verified transport drivers in Zimbabwe, backed by Supabase. Also packaged as a native Android app via Capacitor.

## Prerequisites

1. Clone the repository.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.

## Environment Variables

Create `.env.local` in the project root with your Supabase project's values:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_VAPID_PUBLIC_KEY=your_web_push_vapid_public_key
```

Maps can use interactive Google Maps on web, PWA, admin and the Android WebView.
Until a Google browser key is configured, the existing MapLibre maps remain
available. Road routes, distance estimates and pin reverse-address labels still
use the existing OSRM/OpenStreetMap services; this change replaces the basemap,
not the booking-distance provider.

## Android active-delivery background tracking

Only an assigned driver with an active delivery starts native background
tracking. Android displays a persistent **MoveZW delivery tracking** notification
while the service is running. Completing/cancelling the trip, turning tracking
off, or signing out stops it. MoveZW deliberately does not request the broad
`ACCESS_BACKGROUND_LOCATION` permission; the foreground service begins while
the driver has the app open.

Before releasing the Android build, apply the database migration and deploy the
narrow tracking endpoint:

```bash
npx supabase db push
npx supabase functions deploy driver-location-background --no-verify-jwt
```

The endpoint verifies user authentication when a trip starts, then gives the
native service a random single-trip token. Only a SHA-256 hash is stored, the
token expires after 24 hours, and every location write rechecks that the driver
is still assigned to an active job. Never replace that token with the Supabase
service-role key.

For native Android push, deploy the Supabase notification functions with a
`FIREBASE_SERVICE_ACCOUNT_JSON` secret containing the Firebase service-account
JSON for the project configured in `android/app/google-services.json`.

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
```

## Deploy

- **Web:** hosted on Vercel (`vercel.json` configures SPA rewrites). Pushing to the deployed branch triggers a new deployment.
- **Android:** packaged via Capacitor (`capacitor.config.json`). Run `npm run build` then sync/build through Capacitor's Android tooling.

## Unaccepted request expiry

Open requests disappear from customer/driver pages ten hours after
`scheduled_date` for scheduled pickups, or `created_at` for Now requests.
Accepted jobs are exempt. Records remain in the database for audit purposes.

Before releasing this change, run the complete SQL file
`supabase/migrations/20260906000100_expire_open_requests.sql` in the linked
project's Supabase SQL Editor. It adds an expiry marker, blocks late bids and
acceptance, and installs a once-per-minute cleanup using pg_cron. Existing
overdue open requests are expired immediately. The UI hides requests at their
deadline independently of the cleanup interval. The SQL is transactional and
can be rerun. Confirm the cron job's successful runs in Supabase Cron History.
This migration has not been tested against the hosted database's existing
triggers; if it fails, retain the error output and investigate before release.

Run `node --test src/lib/requestExpiry.test.js` to check expiry boundaries,
scheduled pickup timezones, and accepted-job exemptions.

## Checks

Run before finishing changes:

```bash
npm run lint
npm run typecheck
npm run build
```

## Scheduled pickup alerts

Accepted scheduled jobs and accepted return-load bookings notify both the
customer and driver when the pickup time arrives. Before releasing this
feature:

1. Deploy the function with gateway JWT verification disabled. The function
   performs its own exact server-key check:
   `npx supabase functions deploy notify-scheduled-pickups --no-verify-jwt`
2. In the Supabase SQL Editor, store the project URL and server secret key in
   Vault (replace both example values):
   `select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'movezw_project_url');`
   `select vault.create_secret('YOUR_SERVER_SECRET_KEY', 'movezw_server_secret_key');`
3. Run `supabase/migrations/20260907000100_scheduled_pickup_alerts.sql` in the
   SQL Editor. Its cron job calls the function once per minute.

Keep the server secret key private. Verify the cron in Supabase Cron History by
creating an accepted test job scheduled a few minutes ahead. Each participant
must receive only one in-app alert and, when enabled, one device push.

## Admin account deletion

Administrators can delete customer and driver accounts from **Admin → User
Management**. The `delete-account` Edge Function verifies the caller's admin
role on the server, blocks deletion of admin accounts and accounts with active
deliveries, wallet funds, or an owned business fleet, and retains anonymized
operational history when required. Deploy changes to this flow with:

```bash
npx supabase functions deploy delete-account
```

## Reliable new-job alerts and Android recovery

New open transport requests create an in-app notification for approved,
unsuspended online drivers. Busy/offline drivers receive alerts only when both
pickup and destination match an active delivery or an open return-route listing.
Matching follows the existing case-insensitive place-name comparison and direction. Each load in a multi-load
booking is a separate job. A database outbox sends web/Android push independently
of the customer's app, retries failures, and stops alerting for closed/expired
jobs. The driver popup queue recovers unread jobs on login/resume and every
15 seconds if realtime is unavailable. It excludes closed/expired jobs and shows
one job at a time; dismissing a popup does not reject the job.

Release requirements (the source changes alone do not enable hosted delivery):

1. Set `FIREBASE_SERVICE_ACCOUNT_JSON` for the Firebase project in
   `android/app/google-services.json`; retain the existing VAPID secrets for web.
2. Deploy `notify-drivers-push` with `--no-verify-jwt`. The handler accepts only
   a dedicated worker credential stored in Vault, validated through a service-only
   RPC; it is no longer a client-callable broadcast endpoint.
3. Ensure Vault has `movezw_project_url` for this project, then apply
   `supabase/migrations/20261023000100_reliable_driver_job_alerts.sql`.
   The migration generates its own random `movezw_job_push_token` in Vault.
4. Publish the web build and rebuild Android using `npm run android:prepare` with
   the production Supabase environment values configured. This command rejects
   missing configuration before syncing the native bundle. Build/sign/distribute
   the updated APK/AAB (version 1.0.22, code 23) through the normal Android release process.
5. Verify with approved online, busy and offline drivers (matching/nonmatching routes), an unapproved driver,
   and a suspended driver. Post multiple loads, close the customer app, and
   confirm one unread notification/popup per job for eligible drivers. Verify busy/offline drivers without matching routes get none. Background
   the Android app and verify system notifications and tap navigation. Interrupt
   FCM temporarily and confirm the outbox is retried by the cron job.

In Supabase Cron History check `movezw-driver-job-push`. Inspect
`driver_job_push_outbox` for rows with no `delivered_at`, their attempts, and Edge
Function logs. Delivery is at least once: a partial push failure can retry a
message; a stable per-job tag replaces the same system notification and the
popup queue deduplicates by job. `delivered_at` means push providers accepted the
attempt (or no subscribed devices remained), not that a phone displayed it.
Android notification permission, channel settings, connectivity and force-stop
state still govern OS notification visibility. User push opt-outs are preserved.

Startup/import failures and React render failures now show recovery UI rather
than a blank screen. The native bundle does not register a PWA service worker.
The affected device's original blank-screen exception has not been reproduced;
verify the new build on that device and collect Android/WebView logs if it persists.


## Google Maps activation

1. In Google Cloud, create/select a project, link a billing account and enable
   **Maps JavaScript API**. This integration does not require enabling Google's
   Routes/Places APIs: existing routing and address services remain in use.
2. Create an API key with **Website** restrictions and **Maps JavaScript API**
   as the only allowed API. Authorize `https://www.movezw.co.zw/*` and
   `https://movezw.co.zw/*`. For the current Capacitor WebView, test a separate
   browser key restricted to `https://localhost/*` on the physical Android build.
   WebViews can omit referrers; if the restriction cannot be verified there,
   use a native Maps SDK integration with its own Android-restricted key rather
   than removing key restrictions. Do not put a service-account key here.
3. Create a **JavaScript map ID**. `DEMO_MAP_ID` works for initial testing;
   use your production map ID before release. Advanced markers require a map ID.
4. Open **Admin → Site content → Google Maps**. Save the browser key and map ID,
   then reload the app. These are public client configuration values, protected
   by Google API/website restrictions, not server secrets. Only admins may edit
   site content. Alternatively set `VITE_GOOGLE_MAPS_BROWSER_KEY` and
   `VITE_GOOGLE_MAPS_MAP_ID` in the build environment (these override admin fields).
5. Test map pan/zoom, satellite view, markers, pin selection, route lines and live
   driver movement on web and physical Android. Nearby-driver coordinates stay
   rounded by the existing server RPC. A map failure is isolated from delivery
   controls. Google authorization failures and network timeouts offer retry UI.

Google Cloud billing/key setup must be completed by the account owner before
Google Maps can be activated. No Google map request is made while no key is set.

## Driver location requirements

Driver location defaults on. Online drivers and assigned active deliveries
cannot disable MoveZW tracking through a stale app preference. The dashboard
checks a fresh GPS fix every time a driver goes online; starting movement also
requires a fix. Permission/GPS failures show an actionable banner, and tracking
is rechecked on resume and every 30 seconds while the app is visible. Successful
profile coordinates are saved at most once per minute; failed saves can retry.

Android still controls the GPS switch and runtime permission. On the phone,
open Settings → Apps → MoveZW → Permissions → Location, allow location while
using the app (precise if offered), and keep the system Location switch on.
Native active-delivery tracking retains its visible foreground-service
notification; this does not introduce covert 24-hour/background tracking while
an offline driver has no active delivery. Version 1.0.22 (23) must be built,
signed and installed for these changes to reach existing native users.

### Registration alerts and private job calls

Drivers enter the admin user directory immediately when Auth creates their profile,
before email confirmation or document onboarding. Drivers can resend their own
verification link from registration/login; an active administrator can confirm a
driver email from Users after verifying ownership. Registration and bid/revised
price alerts are inserted by database triggers and queued in `app_push_outbox`.
The `notify-app-events` worker retries delivery from cron; older app calls to
`notify-offer-push` are acknowledged without sending duplicate alerts.

Before acceptance, a pending bidder and the customer can send only a fixed Ring
attention alert (one per recipient per minute). Conversation RLS and call RPCs
block job chat/audio until that driver is accepted. Ring never requests microphone
access and never carries a phone number or free text. After acceptance, the Call
buttons use audio-only WebRTC with authenticated, participant-only signaling.
Incoming calls expire after 45 seconds; calls stop when the job loses its accepted
state. Call signaling is deleted after expiry plus one day.

For reliable audio across carrier NAT/firewalls, provision a coturn-compatible
relay and set Supabase Edge Function secrets `TURN_URLS` (comma-separated
`turn:`/`turns:` URLs) and `TURN_SHARED_SECRET` (coturn REST shared secret).
`call-ice` authenticates accepted job participants and returns short-lived HMAC
credentials; never put the shared secret in Vite/browser configuration. Without a
relay the app uses STUN, so some network pairs cannot connect. Verify a real call
between two devices on separate mobile networks before treating voice as ready.

Android 1.0.23 / versionCode 24 includes microphone permission and email-link
session handling. Build and distribute a newly signed APK with the existing
signing key; a web deployment does not replace the bundled installed app.
OS notification permission and a registered push token/subscription are required
for background alerts. Repeating in-app ring audio runs while the app is open;
background push uses the OS notification sound, not a full-screen phone dialer.

Validation: `node --test src/lib/*.test.* src/components/DriverLocationPing.test.mjs
supabase/functions/notify-drivers-push/index.test.mjs
supabase/functions/notify-app-events/index.test.mjs
supabase/tests/registration-private-calls.test.mjs`. The database test runs the
migration in PGlite with cron/net stubs and checks unconfirmed directory access,
transactional notifications, ring cooldown, RLS, participant-only signaling, and
cancellation. No real user is called or notified by the tests.


### Verified profiles, bid cards and admin groups (Android 1.0.24 / code 25)

Driver approval now refreshes across onboarding, dashboard and profile using
Realtime, a five-second fallback poll, and resume. Approval of a driver profile
(not email confirmation alone) unlocks the verified state. Approved onboarding
opens the verified profile; explicit profile editing remains available.

Customers see separate MoveZW bid cards with vehicle type/model, plate, payload
in tonnes, rating, ETA, price, View offer, Accept and Decline. Payload is captured
from the driver profile by a server trigger. Legacy truck categories supply known
tonnage; unknown legacy payloads are labelled instead of guessed. Profile forms
collect rated payload for new/edited vehicles. Accept/decline recheck server state;
acceptance serializes competing requests and creates a durable driver alert.

Attention Ring and unanswered job calls last up to three minutes. A recipient can
stop an attention ring immediately; its sender also has Stop ringing. Repeat
chimes run while the app is open; a background OS notification is not an
indefinitely ringing native telephone call.

Admin → Group Calls invites up to five selected drivers OR five selected customers,
plus the admin host (six participants). Invitees choose Join or Decline; no
microphone is opened before Join. Rooms use audio-only WebRTC mesh with private
membership and pair-specific signaling. Groups do not mix customers and drivers.
Leaving/ending as host closes the room; a lost host heartbeat closes access after
45 seconds. Invitations expire after three minutes, rooms after one hour, and
signaling is cleaned up after room expiry plus one day. No recording is added.

TURN secrets and separate-network device tests are still required for dependable
mobile audio, as described above. No TURN service has been provisioned and no
signed APK has been generated. Rebuild/sign/distribute 1.0.24 (25) for native users.
Additional checks: `node --test src/hooks/*.test.mjs src/lib/groupAudio.test.mjs
src/lib/bidPresentation.test.mjs supabase/tests/admin-groups-bids.test.mjs`.

## Driver referral rewards

Drivers can open **Profile → Refer drivers** or **Wallet → Refer drivers** to
copy/share a code and registration/download link. Signup captures the code once
on account creation; existing accounts cannot add or change their referrer.
The download button uses the existing Google Play listing. For a fresh install,
return to the invitation link or enter the displayed code before signing up;
deferred install attribution is not automatic. Native App Links retain `ref`
when Android opens the registration URL in an installed compatible build.

Each distinct referred driver earns the referrer $0.50 after email confirmation,
admin approval and all three document paths are present. There is no referral
limit. Reapproval never repeats the reward. Referrals are unique per account
and normalized signup phone; same-phone self-referrals are excluded. Approval
is still a human document-review decision, not an automatic identity guarantee.

**Admin → Referrals** pauses new attribution and rewards across the app. Existing
credit and pending referrals remain; resuming releases eligible pending rewards.
The database enforces the switch, independent of client refreshes.

Referral credit is included in the commission balance, consumed first for fees,
and excluded from withdrawals. Cancellation and approved commission refunds
restore the promotional portion as fee-only credit. Rewards do not increase
job earnings or count as cash top-ups in the admin finance queue. Existing
minimum wallet-balance rules still apply.

Apply the `driver_referral_rewards` migration before deploying this frontend.
Run `npm run test:referrals` for isolated Postgres integration checks using
PGlite, including authorization, pause/resume and wallet/refund rules. These
checks create no real users or wallet entries. Native installations need a new
signed Android build to receive the referral UI.
