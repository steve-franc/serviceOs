## Why this is happening

The platform has a **subscription tier** system. Every restaurant is assigned a tier (default: **Free**), and each tier carries feature limits stored as JSON, e.g.:

- `max_menu_items: 15`
- `staff_seats: 2`

A database trigger (`enforce_menu_item_limit`) blocks new menu item inserts once the count hits the tier's `max_menu_items`. That's where the error message comes from. The same applies to staff seats.

Right now there's **no UI** to edit those limits or to change a restaurant's tier — the SQL backend exists (`upsert_subscription_tier`, `assign_restaurant_tier`, `delete_subscription_tier`, `get_my_subscription`) but no superadmin screens have been built. So in practice every restaurant is silently stuck on Free.

## What I'll build

A new **Subscriptions** area in the superadmin section, plus a tier picker on each restaurant detail page.

### 1. Superadmin → Subscriptions page (`/superadmin/subscriptions`)

- Lists all tiers (Free / Pro / Enterprise / any custom) as cards.
- Each card shows: name, slug, monthly price (TRY), `is_free`, `is_active`, and the feature JSON rendered as friendly rows: **Max menu items**, **Staff seats**, **Public ordering**, **Analytics**, etc. — with `null` / empty shown as "Unlimited".
- "Edit tier" opens a dialog with editable inputs for:
  - Name, slug, price (TRY)
  - `max_menu_items` (number or "Unlimited")
  - `staff_seats` (number or "Unlimited")
  - Any other feature flags currently in the JSON, rendered generically (boolean → switch, number → input, string → text)
  - Active toggle
- "New tier" button opens the same dialog blank.
- Saves via the existing `upsert_subscription_tier` RPC.
- Delete button (calls `delete_subscription_tier`, blocked server-side if any restaurant uses it).
- Add link in `AppSidebar` (superadmin section) → "Subscriptions".

### 2. Tier picker on Superadmin → Restaurant detail

On `src/pages/superadmin/RestaurantDetail.tsx`, add a small **Subscription** card next to the existing stats:

- Shows current tier name + the active limits.
- Dropdown of all active tiers; selecting one calls `assign_restaurant_tier` and refreshes.
- This lets you bump a single business off Free without touching the tier itself.

### 3. Immediate unblock for the user reporting the bug

After the UI ships, the user just opens **Subscriptions → Free → Edit**, sets `max_menu_items` to "Unlimited" (or a higher number), saves. The trigger immediately stops blocking. No code or migration needed for routine future limit changes — fully self-serve from superadmin.

## Technical notes

- New files:
  - `src/pages/superadmin/Subscriptions.tsx` — list + edit dialog
  - `src/components/superadmin/TierEditDialog.tsx` — form
  - Hooks added to `src/hooks/useSuperadminData.ts`: `useSubscriptionTiers`, `useUpsertTier`, `useDeleteTier`, `useAssignRestaurantTier`
- Edits:
  - `src/App.tsx` — route `/superadmin/subscriptions`
  - `src/components/AppSidebar.tsx` — nav item (superadmin only)
  - `src/pages/superadmin/RestaurantDetail.tsx` — add Subscription card with tier dropdown
- All RPCs already exist server-side; **no database migration required**.
- All operations are gated by `is_superadmin(auth.uid())` already enforced in the RPCs.
- Uses existing design tokens, dialogs, switches, and selects from the shadcn library.

## Out of scope

- Stripe/Dodo billing integration — only the limit editing & tier assignment UI.
- Self-service tier upgrades for managers (still superadmin-only).
