# Account deletion

Settings is available to admins and authorized users. Below System, Delete account opens an email confirmation, then a password confirmation. Cancel clears the form. Password errors clear the password and leave the account intact.

The `delete-account` Edge Function validates the current bearer token, compares the supplied email to that user's email, and verifies the password through Supabase Auth using an isolated session. It deletes only the verified current user via the server Auth admin API; no client-supplied user ID is accepted.

The database deletion trigger serializes admin changes, prevents deletion of the last confirmed admin, removes the admin allowlist entry, and stores a deletion email notice atomically. Foreign keys remove weekly assignments and other user-linked records; controllers remain in the registry. Deleted users cannot regain admin access by signing up with the same email.

Deletion notice delivery uses the same `RESEND_API_KEY` and `REGISTRATION_EMAIL_FROM` secrets as invitations. Provider failure or missing configuration does not undo deletion. The login screen explicitly reports pending email delivery. Unsent notices remain in `public.account_deletion_notices` (`sent_at is null`), accessible only to the server service role, for later delivery after the provider is configured. No automatic retry job is configured yet.

Verified with rollback-only database fixtures and mocked browser flows. No real user's account was deleted during verification. Real mailbox delivery remains unverified until email credentials are configured.
