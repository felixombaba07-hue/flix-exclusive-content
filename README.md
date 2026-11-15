# Flix Exclusive Content

Premium video membership website.

## Migration status
The original AppDeploy React/Vite source is preserved in this repository. A Vercel/Supabase migration foundation has been added:
- `MIGRATION.md`: architecture and cutover checklist.
- `.env.example`: required environment variable names (no secret values).
- `supabase/migrations/0001_initial_schema.sql`: initial relational schema and row-level security.
- `api/health.ts`: basic Vercel serverless API health check.
- `vercel.json`: SPA and API routing.

**Not production migrated yet.** The current frontend and backend still import AppDeploy-specific auth/API/database/storage services. Existing user accounts, uploads, memberships and payment records have not been transferred. Do not deploy this snapshot as the production site until those dependencies are ported and end-to-end tests pass.

## Target services
- Vercel: web app and serverless API.
- Supabase: authentication and PostgreSQL.
- Cloudflare Stream: large video uploads and playback.
- Verotel FlexPay: USD checkout with signed server-to-server postback verification.

See [MIGRATION.md](MIGRATION.md) for setup, product rules and cutover requirements. Never commit secret keys or private media.
