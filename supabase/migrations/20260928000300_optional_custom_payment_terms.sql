-- Replaces the fixed 80/20 choice with an optional, customer-described X/Y
-- arrangement while remaining safe whether or not the preceding migration
-- has already been applied in production.

alter table public.transport_requests
  add column if not exists payment_terms text;

alter table public.transport_requests
  drop constraint if exists transport_requests_payment_terms_check;

update public.transport_requests
set payment_terms = 'split'
where payment_terms = '80_20';

update public.transport_requests
set payment_terms = 'unspecified'
where payment_terms is null;

alter table public.transport_requests
  alter column payment_terms set default 'unspecified',
  alter column payment_terms set not null;

alter table public.transport_requests
  add constraint transport_requests_payment_terms_check
  check (payment_terms in ('unspecified', 'pod', 'split'));
