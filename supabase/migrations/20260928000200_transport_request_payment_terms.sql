-- Records the customer-selected commercial arrangement on every job.
-- Existing requests remain pay-on-delivery. This is intentionally separate
-- from payment_status/payment_method: MoveZW displays the agreement but does
-- not claim to process or escrow customer-to-driver payments.

alter table public.transport_requests
  add column if not exists payment_terms text;

update public.transport_requests
set payment_terms = 'pod'
where payment_terms is null;

alter table public.transport_requests
  alter column payment_terms set default 'pod',
  alter column payment_terms set not null;

alter table public.transport_requests
  drop constraint if exists transport_requests_payment_terms_check;

alter table public.transport_requests
  add constraint transport_requests_payment_terms_check
  check (payment_terms in ('pod', '80_20'));
