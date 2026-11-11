# api (Neon Function)

The church admin and website backend, rebuilt in November 2026 because the source of the old `shekinah` function was lost.
It also takes over the `members` function. Project "Shekinah Church Website" (silent-firefly-93121470), branch br-old-sea-b51wuht3, slug `api`.

- Public: `POST /submit` (all website forms), `GET /content` (live site content).
- Sign in: emailed 6 digit code, 10 minutes, 5 tries. Sessions last 30 days and use the same `admin_sessions` rows as the old server (sha256 of the token).
- Every permission is checked on the server (see `TITLES`, `PERMS`, `AREAS` and `access()` in index.mjs):
  a person has a title (admin, pastor, elder, clerk, staff, editor, leader, volunteer) plus optional per person changes in `admins.perms`,
  the message areas they may see (prayer, visit, contact, bible, transfer, newsletter) and the separate "private prayer requests" box.
  `admins.role` stays admin, staff or volunteer so older code keeps working.
- Mail (sign in codes, replies, staff alerts, newsletters) is sent by the `welcome` function (`POST /send`), which holds the Resend key.
  The two functions share `automation_status.mail_relay_key`, created inside the database by schema.sql. No environment variables are needed here.

Files: index.mjs (the function), schema.sql (additive database changes, safe to run again), test.mjs (186 checks against a real Postgres in memory).

Test: in a folder with `npm install @electric-sql/pglite`, run `node test.mjs /full/path/to/index.mjs`.
Deploy: zip index.mjs as index.mjs and deploy with the Neon MCP deploy_function tool (no bundling needed, it only imports node:crypto).
