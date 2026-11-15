# Verotel FlexPay integration setup

This repository now documents the selected payment provider. The integration must remain disabled until Verotel approves the merchant account and issues production credentials.

## Verotel account values needed (store only in Vercel Environment Variables)
- VEROTEL_SHOP_ID
- VEROTEL_SIGNATURE_KEY
- VEROTEL_MERCHANT_ID (only if required by the selected Verotel brand/client)
- VEROTEL_CURRENCY (one of USD, EUR, GBP, AUD, CAD, CHF, DKK, NOK, SEK; KES is not listed in FlexPay sale currencies)
- APP_URL

Never commit these values, paste the signature key into source code, or expose them in browser JavaScript.

## FlexPay facts to account for
- Create order with GET https://secure.verotel.com/startorder and FlexPay version 4.
- Required subscription fields include shopID, type=subscription, priceAmount, priceCurrency, period (ISO-8601 duration), subscriptionType and signature.
- Recurring subscriptions require at least a 7-day period; one-time subscriptions have a 2-day minimum period. The shortest membership has been changed to 2 days and must be a one-time purchase, not recurring.
- Verotel supports sale currencies USD, EUR, GBP, AUD, CAD, CHF, DKK, NOK and SEK. KES is not listed. Do not silently send KES amounts as if supported. Confirm settlement and displayed price currency with Verotel and choose an explicit conversion/rounding policy before enabling checkout.
- The startorder signature is SHA-256 over the signature key followed by colon-separated, alphabetically sorted key=value parameters (excluding email); UTF-8 values. Verify implementation against Verotel's official test vectors.
- Verotel sends transaction postbacks as GET requests. Validate the signature before changing a membership. Return HTTP 200 with plain text OK within 30 seconds. Do not grant access from the browser success redirect alone.
- Store postback sale/reference IDs uniquely and process idempotently. Handle initial, rebill, extend, cancel, expiry, credit/refund and chargeback events. Reconcile ambiguous cases against Verotel's status page/API.
- Associate each checkout with a Supabase-authenticated user using an opaque, random referenceID mapped to a pending checkout row. Do not trust a user ID supplied only in an unsigned query parameter.

## Membership plan mapping
The product now advertises 2, 7, 14, 30 and 90 days. Use one-time purchases for all plans unless recurring billing is explicitly enabled and approved. A 2-day plan must be one-time. Do not enable a plan until the exact charge amount/currency and period are approved.

## Setup steps
1. Finish Verotel merchant underwriting and get written approval for the exact adult-content business and content category.
2. In Verotel Control Center, create/configure the website, enable FlexPay, set a success URL and a postback URL on the deployed Vercel domain.
3. Confirm merchant currency, Kenyan merchant eligibility, cardholder countries and payout/settlement method with Verotel.
4. Add the credentials above to Vercel Project Settings > Environment Variables (Production and Preview as appropriate).
5. Implement and test signed checkout creation and signed postback verification on a Vercel preview deployment before production.
6. Test successful, declined, cancelled, refunded, duplicate and delayed postbacks. Ensure membership expiry and refunds revoke access correctly.

## Official docs
- https://controlcenter.verotel.com/flexpay-doc/subscription.html
- https://integrations.yoursafe.com/en/flexpay/subscription

Status: database preparation and source documentation updated. Checkout endpoints and frontend migration are not yet connected; no live transaction has been processed.
