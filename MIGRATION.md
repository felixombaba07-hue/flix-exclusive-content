# Vercel migration plan

## Target architecture
- Vercel: React/Vite frontend and serverless API routes.
- Supabase: authentication, PostgreSQL, row-level security and member data.
- Adult-content-compatible video host: large uploads, adaptive playback, thumbnails and signed playback. Cloudflare Stream remains unapproved for this use until its current policy explicitly confirms the exact content category.
- Verotel FlexPay: USD checkout and signed server-to-server postback verification, only after merchant approval and credential setup.

## Verified migration status (15 November 2026)
- Supabase project is connected and contains the core profile, plan, video, payment, membership, favorite, like, comment, view and Verotel checkout-intent tables.
- All listed public tables have RLS enabled.
- Six plans are present in Supabase. Their KSh reference prices are KSh 99 / 2 days, KSh 249 / 7 days, KSh 399 / 14 days, KSh 799 / 30 days, KSh 1,499 / 90 days and KSh 9,999 / lifetime.
- The current stored USD display amounts are $0.76, $1.92, $3.07, $6.15, $11.53 and $76.94 respectively. These are configured values, not a live FX quote or a Verotel-approved price schedule. Confirm merchant currency, minimum charges, fees, rounding and settlement with Verotel before enabling checkout.
- Security advisor currently reports no findings. Performance advisor no longer reports missing indexes for the Verotel checkout-intent foreign keys; remaining unused-index notices are informational on an empty/new database.
- No production deployment has been confirmed. No Verotel transaction has been processed.

## Critical blockers before the first Vercel deployment
1. The current frontend still imports `@appdeploy/client` and the old backend imports `@appdeploy/sdk`. Those packages are not declared in the current `package.json`, and the backend is not yet ported to Vercel Functions/Supabase. The existing frontend API calls therefore do not have a working Vercel API implementation.
2. Only `api/health.ts` currently exists as a Vercel API function. A successful health endpoint would not mean login, video library, admin, memberships, playback or payments work.
3. The old Paystack checkout code remains in `backend/index.ts`. It must not be exposed or used for this adult-content business; replace it with the approved Verotel integration only after underwriting and credentials.
4. The direct upload implementation is an AppDeploy storage upload limited to about 4 MB, not the required large-file video pipeline.
5. Existing AppDeploy accounts, uploads, memberships and payment records have not been migrated.
6. The admin role must be assigned and checked server-side using trusted database data; never trust user-editable profile metadata or a browser-only admin flag.

Do not treat the Vercel project settings being correct as proof that the application is ready. Do not promote to production until the frontend and API migration builds and passes end-to-end tests.

## Required configuration
Set secrets only in Vercel Project Settings > Environment Variables. Never commit real values:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (browser-safe publishable/anon key only)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never use a VITE_ prefix)
- `VEROTEL_SHOP_ID`, `VEROTEL_SIGNATURE_KEY`, and any other merchant identifiers Verotel requires
- `VEROTEL_CURRENCY=USD`
- `APP_URL`
- Video-provider credentials only after its adult-content policy and account approval are confirmed.

## Migration sequence
1. Port frontend sign-in/session handling to Supabase Auth.
2. Replace all AppDeploy API calls with Vercel serverless endpoints backed by Supabase.
3. Implement server-side admin authorization and test RLS policies for each user action.
4. Select and approve an adult-content-compatible video host. Implement authenticated large-file uploads, private playback tokens, cover-image uploads and deletion cleanup.
5. Implement Verotel FlexPay v4 signed checkout creation and signed postback handling. Grant membership only after a valid, idempotently processed server-to-server postback. The 2-day plan must be one-time; lifetime must grant permanent access without an expiry timestamp.
6. Migrate existing data and media from AppDeploy using an export; reconcile counts and test signed playback.
7. Add Vercel environment variables, deploy a preview, run auth/admin/upload/playback/payment/refund/expiry/mobile tests, then promote production.

## Product rules to preserve
- Membership prices: KSh 99 / 2 days, KSh 249 / 7 days, KSh 399 / 14 days, KSh 799 / 30 days, KSh 1,499 / 90 days, KSh 9,999 / lifetime.
- Indicative stored USD prices: $0.76, $1.92, $3.07, $6.15, $11.53 and $76.94 respectively. Do not assume these amounts satisfy Verotel minimums or approval.
- Admin-only video editing, categories, uploads, prices/discounts and promo-carousel ordering.
- Free promo videos appear first and autoplay sequentially with a sliding transition.
- Exclusive videos require active paid access. Lifetime access never expires.
- Member profile, subscription details, favorites/watchlist, views, likes and comments.
- Video playback must use short-lived signed tokens/URLs. Never expose video-provider API tokens or the Supabase service-role key in browser code.
- Adult content must be lawful, consensual, age-restricted, and comply with applicable law and the current policies of the selected host/payment provider. Do not upload or distribute content involving minors or non-consensual material.

## Cutover safety
Keep the current AppDeploy deployment and its data intact until the Vercel version passes authentication, admin authorization, upload, playback, payment verification, refund/chargeback handling, membership expiry, lifetime access and mobile tests.
