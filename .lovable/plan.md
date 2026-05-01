## Goal

Introduce a **superadmin** ("God mode") role that exists outside the per-restaurant tenancy. A superadmin can view every restaurant in the project, inspect their data (orders, revenue, staff, inventory, debtors, expenses), and perform admin actions: put a restaurant on hold, delete a restaurant, remove staff members, change roles, etc.

Critically, a superadmin is **not** a member of any restaurant — they don't show up as staff, don't appear in restaurant rosters, and don't pollute reports.

---

## How superadmin differs from existing roles

| | Existing roles (manager/ops/server/counter/investor) | Superadmin |
|---|---|---|
| Scoped to one restaurant | Yes (via `restaurant_id`) | No — global |
| Stored in `user_roles` | Yes, with `restaurant_id` | Yes, with `restaurant_id = NULL` |
| Shows up as staff | Yes | **No** |
| Sees all restaurants | No | **Yes** |
| Can delete restaurants | No | **Yes** |

---

## What gets built

### 1. Database (one migration)

- Add `'superadmin'` to the `app_role` enum.
- Add a security-definer function `public.is_superadmin(_user_id uuid) returns boolean` that checks `user_roles` for a row with `role = 'superadmin'` (any/null `restaurant_id`).
- Add a `restaurants.status` column: `'active' | 'on_hold' | 'archived'` (default `'active'`).
- Extend RLS on every tenant table (`orders`, `order_items`, `menu_items`, `menu_tags`, `inventory`, `daily_reports`, `daily_expenses`, `debtors`, `tabs`, `tab_items`, `restaurant_settings`, `restaurant_memberships`, `user_roles`, `restaurants`, `profiles`) so `is_superadmin(auth.uid())` grants full SELECT/INSERT/UPDATE/DELETE — without touching existing tenant policies.
- Add an "on hold" guard: when `restaurants.status = 'on_hold'`, block new order creation in `create_staff_order` and `create_public_order` (raise a clear error). Superadmins are unaffected.
- Add SECURITY DEFINER admin RPCs callable only by superadmins:
  - `superadmin_list_restaurants()` → restaurants + aggregated counts (orders, revenue, staff count, status).
  - `superadmin_get_restaurant_overview(_restaurant_id)` → detailed snapshot.
  - `superadmin_set_restaurant_status(_restaurant_id, _status)`.
  - `superadmin_delete_restaurant(_restaurant_id)` → cascades cleanup of all child rows.
  - `superadmin_remove_staff(_user_id, _restaurant_id)` → removes membership + role rows.
  - `superadmin_change_role(_user_id, _restaurant_id, _role)`.
- Bootstrap: the migration does **not** auto-assign superadmin. After the migration runs, you (the project owner) tell me the email/user id and I'll insert one row via the data tool.

### 2. Auth context (`useRestaurantAndRole.tsx`)

- Detect superadmin status in parallel with the normal role lookup.
- Expose `isSuperadmin` on the context. Superadmin users **bypass** the "no membership" empty-state and are routed straight to a new `/superadmin` dashboard.
- Superadmins do not get a `restaurantId` — UI must use the picker (see below) instead.

### 3. Routing & guards (`App.tsx`)

- New route `/superadmin` (and nested `/superadmin/restaurants/:id`), protected by a new `SuperadminRoute` guard.
- `ObserverBlockedRoute` and `PublicOnlyRoute` updated so superadmins land on `/superadmin` after login instead of `/order/create`.

### 4. Sidebar (`AppSidebar.tsx`)

- When `isSuperadmin`, replace all groups with a single **God Mode** section: `Overview`, `Restaurants`, `Users`, `Activity`. No staff / manager items shown — keeps the role invisible from the tenant perspective.

### 5. New pages

- **`/superadmin` Overview** — totals across all restaurants: restaurant count, active vs on-hold, today's orders, today's revenue, low-stock alerts, recent signups.
- **`/superadmin/restaurants`** — searchable table of every restaurant with status badge, staff count, last activity, and inline actions: *View details*, *Put on hold / Resume*, *Delete* (with typed confirmation).
- **`/superadmin/restaurants/:id`** — drill-down: settings, staff list (with remove + role change), recent orders, revenue chart, inventory, debtors, expenses.
- **`/superadmin/users`** — global user list across all restaurants with role/restaurant column.

All pages call the new RPCs only — no direct table queries — so RLS stays the source of truth.

### 6. Memory updates

- Update `mem://features/role-definitions-and-permissions` to document superadmin.
- Add `mem://features/superadmin-god-mode` describing the global scope and that it must never appear in staff lists.
- Refresh the Core line about roles in `mem://index.md`.

---

## Security notes

- Superadmin checks always run server-side via `is_superadmin()` in RLS / SECURITY DEFINER RPCs — never trusted from the client.
- Destructive RPCs (`delete_restaurant`, `remove_staff`) re-check `is_superadmin(auth.uid())` at the top and raise on failure.
- Superadmin rows in `user_roles` use `restaurant_id = NULL`, so they're naturally excluded from any per-restaurant staff query (which all filter by `restaurant_id`).

---

## Open questions before I build

1. Bootstrap: after the migration, which email/user should be granted superadmin? (I'll insert that one row for you.)
2. "On hold" semantics — should it block **only new orders** (my proposal) or also hide the public order page entirely and lock staff out of the dashboard?
3. Restaurant **delete**: hard delete (rows gone forever) or soft delete (status = `'archived'`, hidden everywhere but recoverable)? I recommend soft archive + a separate "purge" action for true deletion.
