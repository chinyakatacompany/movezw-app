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

The website, PWA, admin dashboard, and installed Android app all use MapLibre
with OpenStreetMap tiles and OSRM routes. No Google Maps API key or Google Cloud
billing account is required.

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

New open transport requests now create an in-app notification for every approved,
unsuspended driver (including busy/offline drivers). Each load in a multi-load
booking is a separate job. A database outbox sends web/Android push independently
of the customer's app, retries failures, and stops alerting for closed/expired
jobs. The driver popup queue recovers unread jobs on login/resume and every
15 seconds if realtime is unavailable. It excludes closed/expired jobs and shows
one job at a time; dismissing a popup does not reject the job.

Release requirements (the source changes alone do not enable hosted delivery):

1. Set `FIREBASE_SERVICE_ACCOUNT_JSON` for the Firebase project in
   `android/app/google-services.json`; retain the existing VAPID secrets for web.
2. Deploy `notify-drivers-push` with `--no-verify-jwt`. The handler accepts only
   the exact server key; it is no longer a client-callable broadcast endpoint.
3. Ensure Vault has `movezw_project_url` and `movezw_server_secret_key` as described
   under scheduled pickup alerts, then apply
   `supabase/migrations/20261023000100_reliable_driver_job_alerts.sql`.
4. Publish the web build and rebuild Android using `npm run android:prepare` with
   the production Supabase environment values configured. This command rejects
   missing configuration before syncing the native bundle. Build/sign/distribute
   the updated APK/AAB (version 1.0.21, code 22) through the normal Android release process.
5. Verify with two approved drivers (online and offline), an unapproved driver,
   and a suspended driver. Post multiple loads, close the customer app, and
   confirm one unread notification/popup per job for eligible drivers. Background
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
