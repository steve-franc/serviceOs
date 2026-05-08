## 1. Persist filters + scroll position across in-app navigation

Today the back button works, but every page remounts fresh — search queries, collapsed categories, tab filters, and scroll positions are lost.

**Add a small route-keyed state cache** (`src/lib/nav-cache.ts`) backed by `sessionStorage`:
- `saveState(routeKey, payload)` / `loadState(routeKey)`
- One `useScrollRestoration(key)` hook that captures `window.scrollY` (and the main scroll container) on unmount and restores on mount.
- One `usePersistentState(key, initial)` hook (drop-in `useState` replacement that round-trips through sessionStorage).

**Wire it into the dashboard pages** that have meaningful filter/scroll state:
- `OrderHistory`, `MenuManagement`, `Inventory`, `Tabs`, `Debtors`, `Bookings`, `Reports`, `CreateOrder`
- Persist: `searchQuery`, `collapsedCategories`, active tab, date range, status filter, and scroll position.
- Cache is keyed on the route path, so navigating away and coming back via the existing `SmartBackButton` restores everything. Cleared on full sign-out.

`ScrollToTop.tsx` is updated so it does **not** clobber restoration when navigating "back" (only scrolls to top on forward navigation — detected via `useNavigationType() === 'POP'`).

## 2. Remove "Place a Public Order" from the landing page

Drop the second hero button in `src/pages/Landing.tsx` so only "Start Free" remains. No other content changes.

## 3. Menu item delete — investigation + fix

Schema shows no FK constraints on `order_items`, `tab_items`, or `service_bookings` referencing `menu_items`, so the delete should succeed at the DB level. The current code (`MenuManagement.tsx` `handleDelete`) shows a generic "Failed to delete item" toast that swallows the real Postgres error.

Steps:
- Surface the real error: `toast.error(error.message ?? "Failed to delete item")` and log to console for diagnostics.
- Verify the delete actually returns rows (`.delete().eq(...).select()`) — if RLS silently blocks (current `is_manager_or_ops` policy + `current_restaurant_id` mismatch), report a clear "You don't have permission" message instead of a misleading success/failure.
- Add a short pre-delete check: count linked `order_items` / `tab_items` / `service_bookings`. If linked, show a confirmation explaining the item will be hidden from the menu but historical references stay intact, and switch to an "archive" path: set `is_available=false`, `is_public=false` instead of deleting. (Pure deletes still allowed when nothing references the item.)
- Replace the native `confirm()` with the existing `AlertDialog` for a consistent UX.

## 4. Public order creation — make it bulletproof

`PublicOrder.handleSubmitOrder` calls `create_public_order` RPC. Failures today bubble up as a single toast and reset nothing, so the user can't tell what went wrong.

Hardening:
- Pre-flight: ensure at least one item has `quantity > 0` OR a valid `slot_at` (today an item with only `extra_units` and no `per_unit_price` would fail server-side with a cryptic message).
- Strip `slot_at: null` keys for non-service items so the payload is minimal/clean.
- On RPC error, show the server's `error.message` directly (it's already user-friendly: "Online ordering is currently unavailable", "One or more menu items are unavailable", etc.) and keep the cart populated so the user can retry.
- Add a single retry on transient network failure (one `setTimeout` retry), then fail.
- If `restaurantId` resolution from URL → settings hasn't completed, disable the submit button (currently the button can be clicked during `pageLoading`/missing settings race).
- Re-fetch `menu_items` right before submitting to catch items that became unavailable or were deleted between page load and checkout — surface a friendly "X is no longer available, please remove it" message identifying the offending item by name (today the RPC just says "One or more menu items are unavailable").
- Add basic phone/location length guards already present in `publicOrderSchema`; ensure schema requires non-empty trimmed values matching the asterisks shown in the form.

## Files touched

- new `src/lib/nav-cache.ts`, `src/hooks/useScrollRestoration.ts`, `src/hooks/usePersistentState.ts`
- edit `src/components/ScrollToTop.tsx`
- edit `src/pages/Landing.tsx` (remove CTA)
- edit `src/pages/MenuManagement.tsx` (delete fix + AlertDialog + persist filters)
- edit `src/pages/PublicOrder.tsx` (submit hardening)
- edit `src/pages/OrderHistory.tsx`, `Inventory.tsx`, `Tabs.tsx`, `Debtors.tsx`, `Bookings.tsx`, `Reports.tsx`, `CreateOrder.tsx` to use the persistence hooks

No DB migrations required.
