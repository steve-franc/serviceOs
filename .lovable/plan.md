# Plan: Settings subtab, Superadmin polish, no-refresh tabs

## Change 1 — Settings as its own route/subtab

**New file:** `src/pages/AdminSettings.tsx`
- Hosts the 5 panels currently in Admin's "Settings" tab:
  1. Monthly Bills (Fixed Monthly Expenses + dialog)
  2. Profit Alert Threshold
  3. Branding (Logo upload + Display Name + Store Currency)
  4. Public Ordering Link (toggle + share link)
  5. Payment Methods (list + add/edit/remove + dialog)
- Owns its own state, data loading (`fetchFixedDailyBills` equivalent), and root-level Dialogs (Monthly Bills, Payment Method edit).
- Responsive nav: 200px vertical sidebar ≥768px, horizontal scrollable pills ≤768px, icon-only ≤420px. Uses `useTabState` so the active panel persists.

**Edited files:**
- `src/pages/Admin.tsx` — strip out all settings panels, root-level settings dialogs, and the `topTab`/`settingsPanel` machinery. Page becomes Dashboard-only (stat cards, Daily Bills Target, Workday Notes, Staff Management with its sub-tabs, Staff Invite Link). Keep all data fetching needed for the dashboard. Convert internal `useState` tabs to `useTabState` so switching is preserved across navigation.
- `src/App.tsx` — register `/admin/settings` route (manager-only, inside Layout).
- `src/components/AppSidebar.tsx` — add a "Settings & Admin" group containing two items: **Admin** (`/admin`) and **Settings** (`/admin/settings`). Move the existing Admin entry out of `managerItems` into this new group. Only visible to managers.

## Change 2 — Superadmin polish

The project already has full superadmin impersonation via God Mode (`useRestaurantAndRole`'s `setGodModeDisabled` + impersonated `restaurantId`, sidebar switch, `/superadmin/restaurants` list with "Open" actions). I will NOT rebuild this. The two gaps from the prompt that are real:

- **Hide superadmins from staff lists:** audit every staff query in `Admin.tsx` (and `superadmin/Users.tsx` staff counts if relevant) and filter out users whose `profiles.is_superadmin = true`. Cover: Staff Management Users sub-tab, Total Staff stat card, orders/reports `staff_id` joins (display "Platform Admin" instead of removing — orders placed during impersonation should still be attributable, just not counted as staff).
- **"Super Admin" pill in sidebar footer:** small accent badge next to user identity when `isSuperadminAccount` is true. Already partly present via the God Mode card — add a compact identity row beneath it.

I will skip the `SUPER_ADMIN_EMAILS` constant pattern from the prompt — the DB-backed `is_superadmin` flag is the correct source of truth and is already wired up.

## Change 3 — Stop tab switches from feeling like refreshes

Audit pass, not a rewrite:
- Confirm Layout is the route parent for `/admin` and the new `/admin/settings` so sidebar/header don't unmount. (Already true.)
- Confirm `QueryClient` defaults already disable `refetchOnWindowFocus` / `refetchOnMount`. (Already true.)
- Replace any `useState` tab switchers on Admin & the new Settings page with `useTabState` so panel selection survives navigation and reloads. No `key`-based remounts on tab panels.
- Verify no `navigate()` / `<a href>` is used for in-page tab switching. Sidebar items (route changes) keep using `NavLink`.

## Technical notes

- The "Settings" sidebar entry is gated behind `isManager` (same as Admin today).
- `AdminSettings.tsx` re-uses `formatPrice`, `setActiveCurrency`, `SUPPORTED_CURRENCIES`, `parsePaymentMethods`, `PaymentMethodConfig` — same imports as today.
- No DB migrations.
- No changes to RLS, auth, or currency logic.
- No edits to `src/integrations/supabase/{client,types}.ts`, `.env`, or `supabase/config.toml`.

## Files touched

- create `src/pages/AdminSettings.tsx`
- edit `src/pages/Admin.tsx` (large reduction)
- edit `src/App.tsx` (one new route)
- edit `src/components/AppSidebar.tsx` (group + Settings entry + identity pill)
