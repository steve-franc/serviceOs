## DodoPayments — Platform Subscriptions for ServiceOS

Restaurants subscribe to a paid tier (Pro, Business, etc.) via DodoPayments. When their subscription lapses, they are automatically downgraded to the **Free** tier (with feature restrictions) instead of being locked out. The Superadmin manages plans and views all subscriptions; managers see and manage their own restaurant's plan.

### What gets built

**1. Subscription tiers (Superadmin-managed)**
- Free, Pro, Business (names/limits editable later by superadmin).
- Each tier has: name, monthly price (TRY), DodoPayments product/price ID, and a JSON `features` blob (e.g. `{ max_menu_items: 20, public_ordering: false, bookings: false, reports: false }`).
- The **Free tier** is a real tier with hard feature gates so a downgrade has teeth.

**2. Restaurant ↔ subscription state**
- Every restaurant has a current `tier_id`, `subscription_status` (`free`, `active`, `past_due`, `cancelled`), `current_period_end`, and a `dodo_subscription_id`.
- New restaurants start on **Free**.

**3. Manager checkout flow** (`/billing` page)
- Shows current plan, next renewal date, and the tier comparison.
- "Upgrade" button calls a `dodo-create-checkout` edge function → returns a DodoPayments hosted checkout URL → redirects the manager.
- After payment, DodoPayments redirects back to `/billing?status=success`. The webhook (below) is the source of truth — the page just polls for the new status.

**4. DodoPayments webhook** (`dodo-webhook` edge function, `verify_jwt = false`)
- Receives `subscription.active`, `subscription.renewed`, `subscription.failed`, `subscription.cancelled` events.
- Verifies the webhook signature using DodoPayments' signing secret.
- Updates the restaurant's `subscription_status`, `current_period_end`, and `tier_id` accordingly.
- On `failed` or `cancelled` past expiry → downgrade to Free tier.

**5. Auto-downgrade job**
- Extend the existing `auto-close-day` pattern: a daily `pg_cron` job calls a `subscription-sweep` edge function that finds restaurants where `current_period_end < now()` and `subscription_status != 'free'`, downgrades them to Free, and writes a broadcast notification ("Your Pro plan ended, you're now on Free").

**6. Feature gating**
- A new `useTierFeatures()` hook reads the restaurant's tier features from the existing restaurant context.
- Apply gates in the most visible places: public ordering toggle (Free = off), max menu items (Free = capped), reports/analytics pages (Free = locked screen with "Upgrade" CTA), bookings page (Free = locked).
- Gates are enforced **in the database too** via RLS / triggers for menu-item count, so the limit can't be bypassed via API.

**7. Test/Live mode toggle (Superadmin only)**
- Stored in `platform_settings` table (singleton).
- Superadmin → Billing settings page picks `test` or `live`. The edge functions read this setting and pick the matching DodoPayments API key (`DODO_TEST_API_KEY` vs `DODO_LIVE_API_KEY`) and webhook secret.

**8. Superadmin Billing dashboard** (`/superadmin/billing`)
- Tier CRUD (create/edit/delete tiers, set DodoPayments price IDs, edit feature limits).
- Subscriptions list: every restaurant with its tier, status, next renewal, lifetime revenue.
- Mode toggle (Test / Live) + button to test the webhook signature.

### Free tier feature restrictions (proposal — editable later)

| Feature | Free | Pro | Business |
|---|---|---|---|
| Menu items | up to 15 | unlimited | unlimited |
| Public ordering page | off | on | on |
| Service bookings | off | on | on |
| Reports & analytics | last 7 days | full | full + exports |
| Staff seats | 2 | 10 | unlimited |
| Superadmin broadcasts to me | yes | yes | yes |

### Secrets needed (you'll add when prompted during build)

- `DODO_TEST_API_KEY`
- `DODO_LIVE_API_KEY`
- `DODO_TEST_WEBHOOK_SECRET`
- `DODO_LIVE_WEBHOOK_SECRET`

### Things to know before approving

- **DodoPayments is not a built-in Lovable payments integration.** Lovable's built-in providers are Paddle, Stripe, and Shopify, all of which Lovable can fully manage (test/live, hosted checkout, MoR/tax). DodoPayments will be a custom integration — you provide the API keys, you handle the DodoPayments dashboard, and we wire up checkout + webhooks ourselves. If you want zero account setup or automatic tax handling, **Paddle** would be a better fit; happy to switch.
- **Webhook URL.** After enabling, you'll need to paste the webhook URL we generate (`https://<project>.supabase.co/functions/v1/dodo-webhook`) into your DodoPayments dashboard, twice — once for the test environment and once for live.
- **Currency.** DodoPayments supports TRY in most regions but verify your DodoPayments account is approved for TRY before going live.

### Technical sketch

```text
restaurants ──▶ subscription_tier_id ──▶ subscription_tiers (id, name, price_try, dodo_price_id, features jsonb)
            └── subscription_status, current_period_end, dodo_subscription_id, dodo_customer_id

edge functions:
  dodo-create-checkout   (auth: manager) → returns hosted checkout URL
  dodo-webhook           (no auth, signature verified)        → updates restaurant subscription
  subscription-sweep     (cron, daily 03:00 Europe/Istanbul) → downgrade expired to Free

frontend:
  /billing               (manager)        — current plan, upgrade, history
  /superadmin/billing    (superadmin)     — tiers CRUD, mode toggle, subscriptions list
  useTierFeatures()      hook             — gates UI by tier.features
  <PaywallGate feature="reports">         — wraps locked pages with upgrade CTA
```
