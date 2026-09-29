-- Store the customer's actual X/Y percentage split in payment_terms.
-- Existing generic `split` rows remain valid for backwards compatibility.
alter table public.transport_requests
  add column if not exists payment_terms text;

alter table public.transport_requests
  drop constraint if exists transport_requests_payment_terms_check;

alter table public.transport_requests
  add constraint transport_requests_payment_terms_check
  check (
    payment_terms in ('unspecified', 'pod', 'split')
    or (
      payment_terms ~ '^(100|[0-9]{1,2})/(100|[0-9]{1,2})$'
      and split_part(payment_terms, '/', 1)::integer
        + split_part(payment_terms, '/', 2)::integer = 100
    )
  );
