# welcome (Neon Function)

Sends one welcome email through Resend to each new newsletter subscriber.

Project "Shekinah Church Website" (silent-firefly-93121470), branch br-old-sea-b51wuht3, slug `welcome`.
A Neon schedule trigger (`welcome-emails`, every 5 minutes) POSTs to `/`.
Each run reads new `submissions` rows with kind `newsletter`, sends the email, and records it in `welcome_log`;
the last run status is in `automation_status` (key `welcome_last_run`).
`/unsubscribe?e=<email>&t=<signature>` (GET or one click POST) sets `submissions.unsubscribed`.

Environment (set on the deployment, not in code): RESEND_API_KEY, WELCOME_FROM, WELCOME_REPLY_TO,
UNSUB_SECRET, PUBLIC_URL. DATABASE_URL is injected by Neon.

Build: esbuild index.mjs --bundle --platform=node --target=node24 --format=esm --minify --outfile=dist/index.mjs,
zip dist/index.mjs as index.mjs, then deploy with the Neon API or the Neon MCP deploy_function tool.
