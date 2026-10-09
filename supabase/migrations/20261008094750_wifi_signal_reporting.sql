alter table public.devices add column wifi_rssi smallint
  constraint devices_wifi_rssi_range check (wifi_rssi between -127 and -1);
comment on column public.devices.wifi_rssi is 'Latest controller-reported Wi-Fi RSSI in dBm; null when unavailable.';
