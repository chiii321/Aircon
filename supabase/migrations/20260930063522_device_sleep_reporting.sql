-- Device intent is written only by the token-authenticated gateway.
alter table public.devices
  add column sleep_until timestamptz;
