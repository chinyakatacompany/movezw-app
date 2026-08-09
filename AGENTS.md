# AGENTS.md

## Project Context

MoveZW is a React + Vite PWA (Zimbabwe transport marketplace) backed directly by Supabase (auth, Postgres, storage, edge functions). It's also packaged as a native Android app via Capacitor and deployed to the web via Vercel.

Start with `README.md` for local setup and environment variables.

## Key Files

- `src/`: frontend application source.
- `src/api/supabaseClient.js`: frontend Supabase client.
- `supabase/functions/`: Supabase edge functions (push notifications, etc.).
- `vite.config.js`: Vite config, including the PWA/service-worker setup.
- `capacitor.config.json`: Android app packaging config.
- `vercel.json`: SPA rewrite rules for Vercel hosting.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `npm run dev` for local frontend development against the hosted Supabase backend.
- Run the relevant checks from `package.json` (`lint`, `typecheck`, `build`) before finishing code changes.
- Prefer the existing Supabase client (`src/api/supabaseClient.js`) and existing patterns in `src/lib/` before adding new integration paths.
