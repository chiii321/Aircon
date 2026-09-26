create policy "Authorized users read their own weekly bookings"
  on public.weekly_room_assignments for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_authorized_user()));
