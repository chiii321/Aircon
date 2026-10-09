-- Null means this firmware has not reported a connected power mode.
-- Existing device SELECT policies and the token-authenticated gateway apply.
alter table public.devices
  add column power_mode text check (power_mode in ('active', 'modem_sleep'));
