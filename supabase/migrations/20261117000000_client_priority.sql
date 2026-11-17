-- ============================================================================
--  SIPE — client priority + automatic reminders. Idempotent.
--
--  clients.key_client          the user's own "this client matters" pin. Key
--                              clients sort first on /clients and their items
--                              rise in "Needs attention".
--  business_profiles.auto_reminders
--                              off by default. When on, the daily
--                              client-reminders-batch function emails clients
--                              about unpaid invoices: 2 days before the due date,
--                              then 1, 7 and 14 days after it. Each stage is sent
--                              once per invoice (email_log kind
--                              'client_reminder_<stage>', ref_id = document id).
-- ============================================================================
alter table public.clients
  add column if not exists key_client boolean not null default false;

alter table public.business_profiles
  add column if not exists auto_reminders boolean not null default false;
