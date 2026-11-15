# Flix Exclusive Content

Premium video membership website.

## Current migration status
The Vercel project settings have been confirmed as Vite, production branch `main`, with no build error reported in the dashboard. The application itself is **not yet ready for deployment**.

The repository contains an original AppDeploy React/Vite frontend and backend plus a Supabase migration foundation. The current frontend still imports `@appdeploy/client`, the old backend imports `@appdeploy/sdk`, and the Vercel API currently contains only a health-check endpoint. The old Paystack implementation and small AppDeploy file-upload flow are not a working Verotel/large-video integration.

Supabase currently contains the core tables, RLS, six membership plans and Verotel checkout-intent records. This does not mean that frontend authentication, API routes, payments, media uploads or playback have been migrated or tested.

**Do not promote this snapshot to production.** Complete the port to Supabase Auth and Vercel Functions, replace Paystack with approved Verotel FlexPay integration, select an adult-content-compatible video host, migrate existing data, and pass end-to-end tests first.

## Target services
- Vercel: web app and serverless API.
- Supabase: authentication and PostgreSQL.
- Adult-content-compatible video host: choose only after written policy/account approval for the intended content.
- Verotel FlexPay: USD checkout with signed server-to-server postback verification, subject to merchant approval.

See [MIGRATION.md](MIGRATION.md) for verified status, configured plans, blockers and cutover checklist. Never commit secret keys or private media.
