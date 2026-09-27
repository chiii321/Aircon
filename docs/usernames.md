# Usernames

New registrations require username, email, password and matching repeat password. Usernames are stored lowercase, unique, and restricted to 3–30 ASCII letters, numbers or underscores. An auth-user insertion trigger creates the profile atomically and rejects missing/invalid usernames. Existing accounts remain unchanged; Settings → Profile allows adding or changing a username for both approved roles.

Profile RLS allows authenticated users to read and save only their own profile. Profile deletion follows account deletion. Email login remains the existing Supabase password flow. Username login uses the username-login Edge Function: the privileged email lookup is available only to service_role, passwords are verified by Supabase Auth, and session tokens are returned without exposing an unauthenticated email lookup. Confirmation remains required. The function applies database-backed attempt limits per username (10) and IP hash (50) per five minutes. Credentials and passwords are never logged.

Verification: JavaScript syntax, transaction-rolled-back uniqueness/RLS checks, service-only email lookup privilege, and invalid login endpoint response. Real registration/confirmation and successful username sign-in still need user testing with a real account. No existing user's username was set during verification.
