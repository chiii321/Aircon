# Secure registration invitations

Invitations are issued only by the admin-checked send-registration-link Edge Function. Each emailed link has a cryptographically random 256-bit token tied to the destination email. Only a SHA-256 token hash is stored. Invitations expire after 48 hours and are single-use.

The registration page checks email and token before enabling signup. The auth.users BEFORE INSERT trigger independently validates and consumes the token atomically, then strips it from stored user metadata. Changing the URL email, omitting/faking the token, replaying it, or bypassing the page to call Supabase Auth directly does not bypass this check. Admin approval and time-bound device access remain separate requirements. Existing accounts remain unaffected. Old email-only links require a new invitation.

The invitations table has RLS and no browser-role grants. The public validation RPC returns only a boolean for an exact email/token match. Failed account creation rolls back token consumption with the auth transaction. Email provider failure does not expose tokens via the API response; admins can resend an invitation.

Verification: transaction-rolled-back checks rejected missing token, changed email, expired token and reuse; valid invitation allowed fixture creation and consumed the token without storing it in auth metadata. Direct public Auth signup without token returned an error. No real account created or test email sent. Actual invited registration and inbox delivery still need user testing.
