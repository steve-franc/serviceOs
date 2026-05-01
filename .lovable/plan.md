## Goal

Let service-oriented businesses (salons, clinics, consultants, tutors, etc.) sell **bookable timeslots** alongside or instead of physical products — using the same menu/order foundation we already have.

A menu item can be marked as a **Service**. Services have a duration, weekly availability, and a slot capacity per timeslot. On the public page, customers tap a "Book" button that opens a calendar to pick a date + time. Staff manage everything from a new **Bookings** page (calendar view).

---

## What changes for users

### Menu Management (manager view)
- New toggle on each menu item: **"This is a service"**.
- For new businesses whose `business_type` is service-oriented (salon, spa, clinic, consultancy, tutoring, fitness, etc.), the toggle defaults to **on** for new items. Restaurants/retail stay off by default. Always editable.
- When "service" is on, the form reveals service-specific fields and hides physical-stock fields:
  - **Duration** (e.g. 30 / 45 / 60 / 90 / 120 min, or custom)
  - **Capacity per slot** (default 1 — e.g. 1 chair, or 5 for group classes)
  - **Weekly availability**: per weekday, an active toggle and a list of time windows (e.g. Mon 09:00–13:00, 14:00–18:00). Defaults to a sensible Mon–Fri 9–5.
  - **Buffer between bookings** (optional, minutes)
  - **Advance-booking window** (how many days in advance customers can book — default 30)
- "Stock" terminology becomes "Slots" wherever a service item is shown.

### Public order page (customer view)
- Service items show a **Book** button instead of the usual `+` quantity stepper.
- Tapping Book opens a sheet/dialog with:
  1. A **calendar** (next N days, days fully booked or outside availability are disabled)
  2. After picking a date, a grid of **available time slots** (greyed out when capacity is full)
  3. Confirm → adds the service to the cart with its chosen date+time attached
- The cart shows the service line with its booked slot ("Haircut · Tue 5 May, 14:30"). Multiple services can be booked in one order.
- Checkout proceeds as today (name, phone, payment method, notes). Order is created in `pending` status as it is now.

### New Bookings page (staff view)
- New sidebar entry **"Bookings"** (visible to all staff for the business; managers can edit).
- Default view: today's agenda — vertical timeline grouped by service, showing customer name, phone, status, payment status.
- Tabs: **Today**, **Upcoming**, **Past**, plus a **Week** calendar view.
- Each booking links to its underlying order (the existing Orders page still shows the same record, with an extra "Booked for…" badge).
- Staff can mark a booking as **Completed**, **No-show**, or **Cancelled**. Cancelling frees the slot.

### Sidebar terminology (cosmetic, business-type aware)
- For service business types, the **Menu** label becomes **Services** and **Inventory** becomes **Resources** (already-exposed pages, just relabeled). Restaurants stay as "Menu / Inventory".

---

## What changes under the hood

### Database (new + altered tables)
- `menu_items`: add `is_service boolean default false`, `service_duration_minutes int`, `slot_capacity int default 1`, `buffer_minutes int default 0`, `advance_booking_days int default 30`.
- New table `service_availability` — weekly recurring windows per service:
  - `menu_item_id`, `weekday` (0–6), `start_time`, `end_time`, `is_active`.
- New table `service_bookings` — one row per booked slot (a service order item can book exactly one slot):
  - `order_id` (FK → orders), `order_item_id` (FK → order_items), `menu_item_id`, `restaurant_id`, `start_at timestamptz`, `end_at timestamptz`, `status text` (`booked` / `completed` / `no_show` / `cancelled`).
  - Indexes on `(restaurant_id, start_at)` and `(menu_item_id, start_at)`.
- Business-type → defaults: a small frontend constant (no DB change needed) — `['salon','spa','clinic','consultancy','tutoring','fitness','services_other']` flips the default.

### RLS
- `service_availability`: public read for the same conditions as `menu_items` (so the public order page can render); managers/ops can write.
- `service_bookings`: restaurant members can read; staff and managers can update status; insert happens through security-definer RPCs (see below).

### RPCs (security definer, mirroring existing patterns)
- `get_available_slots(_menu_item_id uuid, _from date, _to date) returns table(start_at timestamptz, remaining int)` — combines `service_availability` × duration × buffer × existing bookings to compute free slots. Public-callable for `is_public` services.
- Extend `create_public_order` and `create_staff_order` to accept an optional `slot_at timestamptz` per item. When the item is a service:
  - Validate the slot is within an availability window.
  - Validate `count(active bookings) < slot_capacity` for that exact start (concurrency-safe via row-level lock or unique partial index).
  - Insert into `service_bookings` after the order item is created.
- `cancel_service_booking(_booking_id uuid)` — sets status to `cancelled` and frees capacity.

### Frontend
- New `src/pages/Bookings.tsx` (calendar/agenda) and route in `App.tsx` + `AppSidebar.tsx`.
- New components: `ServiceFormSection.tsx` (the duration/availability fields in the menu dialog), `BookSlotDialog.tsx` (calendar + timeslot picker), `BookingsCalendar.tsx`.
- `useQueries.ts` additions: `useBookings()`, `useAvailableSlots(menuItemId, range)`.
- Update `MenuManagement.tsx` to render the service toggle and conditional fields.
- Update `PublicOrder.tsx` so service items render a Book button and the cart line stores `slot_at`.
- Update `CreateOrder.tsx` similarly for staff orders.
- Update receipts/order detail to show the booked time.

### Auto-suggest by business type
- A small helper `isServiceBusiness(businessType)` flips the menu-item form's default for `is_service` and relabels sidebar entries. No data migration — only affects new items and labels.

---

## Out of scope (for this iteration)
- Multi-resource scheduling (e.g. specific staff member assigned to a booking).
- Recurring/subscription bookings.
- Email/SMS reminders.
- Customer-facing reschedule link.

These are good follow-ups but each is meaningful on its own; bundling them in would balloon this change.

---

## Suggested rollout order
1. DB migration (new columns, new tables, RLS, `get_available_slots` RPC).
2. Menu Management UI for service fields.
3. Public booking flow (`BookSlotDialog`) + extended `create_public_order` RPC.
4. Staff `CreateOrder` parity + `create_staff_order` RPC.
5. New **Bookings** page (agenda + week calendar).
6. Business-type-aware defaults and label tweaks.
