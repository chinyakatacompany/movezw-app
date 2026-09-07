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
