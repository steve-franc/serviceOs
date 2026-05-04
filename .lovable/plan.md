## DodoPayments multi-tier subscriptions — integration guide

The database scaffolding is already done from our previous migration: `subscription_tiers` (Free / Pro / Business seeded), `restaurants.tier_id / subscription_status / current_period_end / dodo_subscription_id / dodo_customer_id`, `platform_settings.payment_mode` (`test` | `live`), `billing_events`, plus RPCs (`get_my_subscription`, `superadmin_list_subscriptions`, `superadmin_upsert_tier`, `superadmin_delete_tier`, `superadmin_set_platform_mode`, `dodo_handle_subscription_event`, `subscription_sweep_expired`) and feature-gate triggers for `max_menu_items` and `staff_seats`.

This plan covers everything left, in the right order. It's grounded in the official DodoPayments **Subscription Integration Guide** and **Webhooks** docs (Standard Webhooks spec, `webhook-id` / `webhook-signature` / `webhook-timestamp` headers).

### Step 1 — DodoPayments dashboard setup (you do this in their UI)

For both **Test mode** and **Live mode** in the DodoPayments dashboard:

1. **Create one recurring product per paid tier** (skip Free — it never goes through DodoPayments).
   - Pro → recurring, monthly, 499 TRY → copy the `prod_…` id
   - Business → recurring, monthly, 1499 TRY → copy the `prod_…` id
2. **Get the API key** under Developer → API Keys (one for `test_mode`, one for `live_mode`).
3. **Add the webhook endpoint** under Developer → Webhooks. URL: `https://ahjckmkyttpesxpjvqil.supabase.co/functions/v1/dodo-webhook`. Subscribe to: `subscription.active`, `subscription.renewed`, `subscription.on_hold`, `subscription.failed`, `subscription.cancelled`, `subscription.updated`, `payment.succeeded`, `payment.failed`. Copy the **Secret Key**.
4. Repeat the whole thing in Live mode after Test works end to end.

### Step 2 — Add the four secrets

You'll be prompted for `DODO_TEST_API_KEY`, `DODO_LIVE_API_KEY`, `DODO_TEST_WEBHOOK_SECRET`, `DODO_LIVE_WEBHOOK_SECRET`. Test values are enough to start; Live can be added later.

### Step 3 — Edge function: `dodo-create-checkout` (manager-initiated)

Authenticated. Validates the user is a manager of the restaurant, reads `platform_settings.payment_mode`, picks the matching API key + price id (`dodo_price_id_test` / `dodo_price_id_live`) for the selected tier, then calls **DodoPayments Checkout Sessions**:

```text
POST https://test.dodopayments.com/checkouts   (or live.dodopayments.com)
Authorization: Bearer <API key>
{
  "product_cart": [{ "product_id": "<tier price id>", "quantity": 1 }],
  "customer": { "email": <user.email>, "name": <profile.full_name> },
  "metadata": { "restaurant_id": "...", "tier_id": "...", "mode": "test" },
  "return_url": "https://<app>/billing?status=success"
}
```

Returns the `checkout_url` to the frontend. Metadata is the bridge — the webhook reads it to know which restaurant and tier to update.

### Step 4 — Edge function: `dodo-webhook` (public, signature-verified)

`verify_jwt = false` in `supabase/config.toml`. Reads `webhook-id`, `webhook-signature`, `webhook-timestamp` headers and verifies per the **Standard Webhooks** spec (HMAC-SHA256 over `webhook-id.webhook-timestamp.rawBody` using the secret matching current `platform_settings.payment_mode`). Implementation uses the official `npm:standardwebhooks` library (works in Deno).

Then dispatches by `event.type`:

| Event | Action |
|---|---|
| `subscription.active` / `subscription.renewed` | Set `subscription_status='active'`, set `tier_id` from metadata, update `current_period_end`, store `dodo_subscription_id` + `dodo_customer_id`. |
| `subscription.on_hold` / `subscription.failed` | Set `subscription_status='past_due'`. The Free-tier sweep (Step 6) downgrades them after the period actually ends. |
| `subscription.cancelled` | Switch to Free tier immediately. |
| `payment.succeeded` / `payment.failed` | Log to `billing_events` only (no state change — the subscription event is the source of truth). |

All of this calls the existing `dodo_handle_subscription_event` RPC with the service-role key, which is idempotent on `webhook-id` (already implemented).

Returns `200` immediately on bad-signature with no body change to fail closed; returns `200 {received:true}` on success.

### Step 5 — Manager Billing page (`/billing`)

- Sidebar entry visible to managers only.
- Header: current tier name, status badge (`Free` / `Active` / `Past due`), next renewal date in the project's standard date format.
- Tier comparison cards (Free / Pro / Business) generated from `subscription_tiers`. Current tier shows "Current plan"; others show **Upgrade** / **Switch** buttons that call `dodo-create-checkout` and redirect to the returned URL.
- Past-due banner with **Update payment method** button (calls DodoPayments' Update Payment Method API via a tiny `dodo-update-payment-method` action — out of scope for v1, link to `support@`).
- After return from checkout, the page polls `get_my_subscription` for ~30 seconds so the UI catches up with the webhook.
- Recent invoices table fed by `billing_events` (filtered to manager's restaurant by RLS).

### Step 6 — Auto-downgrade cron (uses existing pattern)

A new edge function `subscription-sweep` (auth: service role) calls the existing `subscription_sweep_expired()` RPC. Schedule it daily at 03:00 Europe/Istanbul via `pg_cron` + `pg_net`, mirroring the existing `auto-close-day` job. The RPC already moves any restaurant whose `current_period_end < now() - 1 day` and status is `active`/`past_due` back to Free.

### Step 7 — Superadmin Billing dashboard (`/superadmin/billing`)

Three sections, all behind the existing superadmin guard:

1. **Mode toggle** — Test / Live segmented control bound to `superadmin_set_platform_mode`. Banner makes it loud when Live is on.
2. **Tier management** — Table of all tiers with inline edit (name, price TRY, `dodo_price_id_test`, `dodo_price_id_live`, features JSON editor with friendly fields for `max_menu_items`, `public_ordering`, `bookings`, `reports_days`, `staff_seats`, `exports`, plus `is_active`). Add/Edit/Delete via `superadmin_upsert_tier` / `superadmin_delete_tier`.
3. **Subscriptions list** — Every restaurant with tier, status, next renewal, lifetime paid (TRY) from `superadmin_list_subscriptions`.

### Step 8 — Feature gating (frontend)

A single `useTierFeatures()` hook reads `get_restaurant_features(restaurant_id)` once per session (60s React Query stale time, matching project standard). A `<PaywallGate feature="bookings">` wrapper renders an upgrade CTA card when the feature is off on the current tier. Apply to:

- Public ordering toggle in Restaurant Settings (Free → forced off and read-only).
- Bookings page route (Free → paywall).
- Reports/analytics: clamp date range to last `reports_days`; show "Upgrade for full history" badge.
- Menu Management add-item button: disable + tooltip when count ≥ `max_menu_items` (DB trigger is the hard backstop).
- Staff add button: same treatment for `staff_seats`.

### Step 9 — End-to-end test (Test mode)

1. Superadmin sets Pro tier's `dodo_price_id_test` to the test product id from your DodoPayments dashboard.
2. Sign in as a manager → `/billing` → click **Upgrade to Pro** → DodoPayments hosted checkout opens.
3. Use a DodoPayments test card. After redirect, the Billing page should flip to "Pro · Active" within ~10s.
4. Confirm in `billing_events` table you see the `subscription.active` row.
5. Manually fast-forward by setting `current_period_end` to yesterday in the DB, then run `subscription_sweep` once → restaurant should be back on Free.

### Heads-up before we build

- DodoPayments **only supports certain currencies per region** — confirm your account is approved for **TRY** in both Test and Live before going to production. If not, we can keep prices in TRY in the UI and bill in USD/EUR at DodoPayments' side; ask me and I'll adjust.
- DodoPayments doesn't have a "Customer Portal" of the depth Stripe does. Update Payment Method works via API (used for `on_hold` recovery). Cancellations are done via PATCH /subscriptions and need a small Cancel button — included in v1.1 if you want it now, otherwise managers email you.
- Free tier never round-trips DodoPayments. Downgrades happen entirely server-side.

### File touch list (when you approve and switch to Build)

```
supabase/config.toml                        edit  (add [functions.dodo-webhook] verify_jwt=false)
supabase/functions/dodo-create-checkout/    new
supabase/functions/dodo-webhook/            new
supabase/functions/subscription-sweep/      new
src/hooks/useTierFeatures.ts                new
src/components/PaywallGate.tsx              new
src/pages/Billing.tsx                       new   (manager-facing)
src/pages/superadmin/Billing.tsx            new
src/components/AppSidebar.tsx               edit  (Billing entry for managers + superadmin)
src/App.tsx                                 edit  (routes: /billing, /superadmin/billing)
src/pages/MenuManagement.tsx                edit  (gate add-item on max_menu_items)
src/pages/Settings*.tsx                     edit  (gate public_ordering toggle)
src/pages/Bookings.tsx                      edit  (PaywallGate)
src/pages/Reports* / Analytics*             edit  (clamp by reports_days)
```

Approve this and I'll add the secrets, write the two edge functions, build both Billing pages, and wire the gates.