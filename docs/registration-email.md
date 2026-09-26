# Registration email setup

Admins can email the existing registration link from User access. The server checks the signed-in account against the admin access RPC before sending. Registration still requires email confirmation and admin approval; this email does not grant access.

The `send-registration-link` Edge Function uses Resend. Configure these Supabase Edge Function secrets privately:

- `RESEND_API_KEY`: a Resend API key with sending permission.
- `REGISTRATION_EMAIL_FROM`: an address on a verified sending domain, optionally `INUVAIR <address>`.

Never put these credentials in browser files or Git. The destination registration URL is fixed to `https://inuvair.tech/register.html`; clients cannot supply an arbitrary link or message. Identical requests in the same minute use provider idempotency keys.

Without these secrets, the server returns an explicit configuration error and does not report that email was sent. Provider acceptance does not confirm inbox delivery.
