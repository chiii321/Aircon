# Names and generated usernames

Registration requires first name, last name, email, password and repeat password. The server derives a lowercase username from the last name and first initial (Juan Dela Cruz → delacruzj). Conflicts receive numeric suffixes. Names are required and limited to 80 characters. Username generation is atomic and serialized for each base name.

Both roles can save names in Settings → Profile. Existing accounts keep email login and can add names to generate their username. Once names have been saved, subsequent name edits preserve the generated username. Users cannot insert or update the username column. The header, saved schedule user names and user-access cards use first name, with email fallback for accounts without names. Excel import continues matching by email to avoid ambiguity between people with the same first name.

Profile RLS limits ordinary users to their own record; admins may read names for user and schedule displays. Username login is handled by the username-login Edge Function. Email lookup is service-only; passwords are verified by Supabase Auth. Registration still requires email confirmation and administrator approval.

Verification: JavaScript syntax, database transaction checks for a generated username and its numeric conflict suffix (for example `delacruzj` → `delacruzj1`) and username update privilege. Real registration and successful sign-in still need user testing. Verification changes are rolled back; existing account names are not invented.
