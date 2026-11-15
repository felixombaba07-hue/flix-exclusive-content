# Vercel migration plan

## Target architecture
- Vercel: React/Vite web frontend and serverless API routes.
- Supabase: PostgreSQL, authentication, row-level security, and member data.
- Cloudflare Stream: large video uploads, adaptive playback, thumbnails and promo-video hosting.
- Paystack: KSh membership checkout and server-side payment verification.

## Important status
This commit prepares the migration foundation; it does not switch the live site or move existing user accounts, uploaded videos, payment records, or secrets. The existing UI and backend still contain AppDeploy imports and must be ported route-by-route before production use.

## Required configuration
Set the variables in .env.example in Vercel Project Settings. Never commit real values:
- Supabase project URL, anon key, and service-role key.
- Paystack secret key.
- Cloudflare account ID, Stream API token, and customer code if used.

## Migration sequence
1. Create Supabase project and apply supabase/migrations/0001_initial_schema.sql.
2. Create Cloudflare Stream account and configure upload/playback tokens.
3. Port authentication and every API route to Vercel serverless functions using Supabase.
4. Replace AppDeploy storage uploads with direct, authenticated Cloudflare Stream uploads; keep video metadata in Supabase.
5. Port Paystack initialize/verify endpoints. Verify transactions server-side before granting access. Use integer KSh amounts and store Paystack references uniquely.
6. Migrate data and media from AppDeploy using an export; reconcile counts and test signed playback before DNS cutover.
7. Configure Vercel environment variables, deploy preview, run end-to-end tests, then promote production.

## Product rules to preserve
- Paid plans: KSh 49/1 day, 199/7 days, 299/14 days, 599/30 days, 1299/90 days. Admin can set a base price and 0–90% discount.
- Admin-only video editing, categories, uploads and promo carousel ordering.
- Exclusive videos require active paid access. Promo videos are public and autoplay sequentially, sliding left.
- Member profile, subscription expiry, favorites/watchlist, views, likes and comments.
- Video playback must use short-lived signed tokens/URLs. Never expose the Cloudflare Stream API token or Supabase service-role key in browser code.
- Adult content must be lawful, consensual, age-restricted, and comply with hosting/payment-provider policies.

## Cutover safety
Keep the current AppDeploy deployment available until the Vercel version passes auth, admin authorization, upload, playback, payment verification, membership expiry, and mobile tests. Do not delete the old app or data during migration.
