Below is a complete inventory of every feature currently shipping in the app, grouped by area. Mark each one as **Free**, **Paid**, or **Limit** (capped on Free, unlimited on Paid). I'll then turn your choices into the actual tier `features` JSON and add the necessary enforcement triggers in the database.

For each feature I note how it would be enforced — most are toggles or numeric caps, identical in shape to the existing `max_menu_items` / `staff_seats` keys.

## Core ordering

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 1 | Take staff orders (Create Order page) | `staff_orders` | Toggle |
| 2 | Public/QR ordering page (`/order/...`) | `public_ordering` | Toggle |
| 3 | Running tabs with partial payment | `tabs` | Toggle |
| 4 | Service bookings (calendar slots) | `service_bookings` | Toggle |
| 5 | Custom payment methods (beyond Cash/Card) | `custom_payment_methods` | Toggle |
| 6 | Multiple currencies / conversion rates | `multi_currency` | Toggle |
| 7 | Discounts on orders | `order_discounts` | Toggle |
| 8 | Edit orders after creation | `edit_orders` | Toggle |

## Menu & inventory

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 9 | Menu items count | `max_menu_items` | Limit (already exists) |
| 10 | Inventory items count | `max_inventory_items` | Limit |
| 11 | Inventory module at all | `inventory_module` | Toggle |
| 12 | Menu item images | `menu_images` | Toggle |
| 13 | Menu categories / tags | `menu_tags` | Toggle |
| 14 | Public vs internal item toggle | `internal_menu_items` | Toggle |
| 15 | Auto stock decrement on order | `stock_automation` | Toggle |
| 16 | Menu sharing (text export / WhatsApp) | `menu_sharing` | Toggle |

## Team & roles

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 17 | Staff seats | `staff_seats` | Limit (already exists) |
| 18 | Manager role | always free | — |
| 19 | Server role | `role_server` | Toggle |
| 20 | Ops role (menu editor) | `role_ops` | Toggle |
| 21 | Counter role | `role_counter` | Toggle |
| 22 | Investor (read-only) role | `role_investor` | Toggle |

## Reports & analytics

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 23 | Daily reports | `daily_reports` | Toggle |
| 24 | Historical report breakdown | `historical_reports` | Toggle |
| 25 | Report history retention | `report_history_days` | Limit (e.g. 30 / 365 / unlimited) |
| 26 | Net profit / margin analytics | `profit_analytics` | Toggle |
| 27 | Customer analytics | `customer_analytics` | Toggle |
| 28 | Category-based revenue tagging | `category_tagging` | Toggle |
| 29 | Expense tracking | `expense_tracking` | Toggle |
| 30 | Debtor management | `debtor_management` | Toggle |
| 31 | Daily bills / fixed expenses | `fixed_expenses` | Toggle |

## Automation & alerts

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 32 | Auto end-of-day close (cron) | `auto_end_day` | Toggle |
| 33 | Manual end-of-day close | always free | — |
| 34 | Low-stock notifications | `alert_low_stock` | Toggle |
| 35 | Low-margin notifications | `alert_low_margin` | Toggle |
| 36 | New order notifications (sound + toast) | `alert_new_order` | Toggle |
| 37 | WhatsApp customer notifications | `whatsapp_notifications` | Toggle |

## Branding & customization

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 38 | Custom restaurant logo | `custom_logo` | Toggle |
| 39 | Custom restaurant name on receipts | always free | — |
| 40 | Profit margin threshold config | `custom_thresholds` | Toggle |
| 41 | Custom timezone | `custom_timezone` | Toggle |

## Data & history

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 42 | Order history retention | `order_history_days` | Limit |
| 43 | Receipt printing | `receipt_print` | Toggle |
| 44 | Receipt re-print from history | `receipt_reprint` | Toggle |

## Volume caps (revenue protection)

| # | Feature | Suggested key | Type |
|---|---|---|---|
| 45 | Orders per month | `max_orders_per_month` | Limit |
| 46 | Public orders per month | `max_public_orders_per_month` | Limit |
| 47 | Open tabs at once | `max_open_tabs` | Limit |
| 48 | Active bookings | `max_active_bookings` | Limit |

## Common SaaS suggestions (typical free vs paid splits)

If you'd like a starting point instead of going row-by-row, here are three opinionated presets you can pick from and tweak:

- **Starter (lean free)** — Free gets: 15 menu items, 2 staff seats, staff orders, manual end-of-day, basic daily reports (7-day history), Cash/Card only, 100 orders/month. Paid unlocks everything else.
- **Growth (generous free)** — Free gets: 30 menu items, 3 staff seats, public ordering, tabs, 30-day history, low-stock alerts. Paid unlocks: bookings, investor role, WhatsApp, custom payment methods, profit analytics, auto end-of-day, unlimited history.
- **Pro-only analytics** — Free is unlimited on operations (menu, staff, orders) but Paid is required for: profit analytics, customer analytics, historical breakdown, expense tracking, debtor management, investor role, WhatsApp.

## How to respond

Reply in any of these ways and I'll execute:

1. **"Use Starter / Growth / Pro-only preset"** — I'll wire it up directly.
2. **A list** like `Free: 1, 2, 3, 9 (cap 15), 17 (cap 2), 23, 33; Paid: everything else` — I'll match it exactly.
3. **A custom mix** with your own caps for any limit row.

## What I'll build once you decide

1. Database migration: add the new feature keys to the Free/Pro/Enterprise tiers' `features` JSON, plus enforcement triggers (BEFORE INSERT or RPC checks) for each new toggle/limit — same pattern as `enforce_menu_item_limit`.
2. A small `useFeature(key)` hook that reads `get_restaurant_features` and returns a boolean / number, so the frontend can hide locked UI and show "Upgrade" prompts instead of letting users hit a server error.
3. Lock UI on the affected pages (Bookings, Tabs, Reports, Debtors, Expenses, etc.) with a shared `<FeatureLocked />` component that links managers to a future upgrade page.
4. Update the superadmin Subscriptions editor to surface the new preset keys in friendly labels (already extensible — I just add them to `PRESET_KEYS`).

No payment processor work is included — that's a separate step we can do once you tell me Stripe vs Paddle and which tiers should map to which prices.