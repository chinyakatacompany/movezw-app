begin;

-- A short-lived, single-trip credential lets the native Android foreground
-- service keep reporting after the WebView is suspended. The plaintext token
-- is returned once to the assigned driver; only its SHA-256 hash is stored.
create table if not exists public.driver_tracking_sessions (
  request_id uuid primary key references public.transport_requests(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_tracking_sessions_driver_id_idx
  on public.driver_tracking_sessions(driver_id);
create index if not exists driver_tracking_sessions_expires_at_idx
  on public.driver_tracking_sessions(expires_at);

alter table public.driver_tracking_sessions enable row level security;
revoke all on table public.driver_tracking_sessions from public, anon, authenticated;

comment on table public.driver_tracking_sessions is
  'Server-only short-lived credentials for native MoveZW active-delivery location updates.';

commit;
