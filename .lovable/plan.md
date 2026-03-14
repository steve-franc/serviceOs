

# Tab System for Running Orders

## What It Does

A "tab" is an open, running order for a customer. Staff can keep adding items to it over time. When the customer is ready to pay, the tab is closed with a payment method, and it becomes a regular completed order.

## Database Changes

**New `tabs` table:**
- `id` (uuid, PK)
- `restaurant_id` (uuid, not null)
- `staff_id` (uuid, not null) — who opened the tab
- `customer_name` (text, nullable) — optional label like "Table 3" or "John"
- `notes` (text, nullable)
- `currency` (text, default 'TRY')
- `status` (text, default 'open') — 'open' or 'closed'
- `closed_at` (timestamptz, nullable)
- `payment_method` (text, nullable) — set when closing
- `total` (numeric, default 0) — running total, updated on close
- `created_at` (timestamptz, default now())

**New `tab_items` table:**
- `id` (uuid, PK)
- `tab_id` (uuid, FK to tabs)
- `menu_item_id` (uuid, FK to menu_items)
- `menu_item_name` (text, not null)
- `quantity` (integer, not null)
- `extra_units` (integer, default 0)
- `base_price_at_time` (numeric, not null)
- `per_unit_price_at_time` (numeric, nullable)
- `subtotal` (numeric, not null)
- `added_at` (timestamptz, default now())

**RLS policies** scoped to restaurant membership, similar to orders table. Staff can create/view tabs for their restaurant; managers can view/close all.

## Frontend Changes

### 1. New Tabs page (`/tabs`)
- List of open tabs with customer name, item count, running total, and time opened
- "Open New Tab" button at top
- Tap a tab to view/add items or close it

### 2. Tab Detail view
- Shows all items added so far with running total
- "Add Items" button opens the menu picker (reuse the same category/item UI from CreateOrder)
- "Close Tab" button prompts for payment method, then converts to a completed order in the `orders` table and marks the tab as closed

### 3. Closing a Tab
When closing:
- Insert a new `order` row with the tab's total, payment method, and items
- Insert corresponding `order_items` rows from `tab_items`
- Update the tab `status` to 'closed', set `closed_at` and `payment_method`
- Navigate to the receipt page

### 4. Navigation
- Add "Tabs" link to the sidebar (between "Create Order" and "Orders")

### 5. Route
- Add `/tabs` protected route in App.tsx

## Technical Notes

- The tab stays as a separate concept from orders until closed — this avoids polluting order history with incomplete tabs
- Closed tabs create real orders so they appear in revenue tracking and daily reports naturally
- Tab items are stored separately so multiple "add to tab" actions over time are preserved

