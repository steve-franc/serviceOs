# Auto End-of-Day with Failsafe

The app already has TWO layers of automatic closing that we'll keep as the source of truth, then layer the UI and failsafe controls the request describes on top.

## What already exists (keep)

- **Server cron (`supabase/functions/auto-close-day`)** — pg_cron pings every 10 minutes, closes each restaurant in its own local timezone at 23:59, runs even when no device is online. This is the true failsafe.
- **Client poller (`src/hooks/useAutoEndDay.ts`)** — 60s poll + catch-up on mount, backup for the cron.
- **Manual reset** — `reset_auto_day_end` RPC clears today's close so the auto system fires again.

## What we add

### 1. Database
One migration adds three columns to `restaurant_settings`:

- `auto_end_of_day_enabled boolean default true`
- `last_manual_end_at timestamptz`
- `next_scheduled_end_at timestamptz` (informational, computed on write)

No new tables, no policies to change (existing settings policies cover the columns).

### 2. Silent auto-restart after manual close
`OrderHistory.tsx` (existing "End Day Manually" button):
- After insert into `daily_reports`, immediately call `reset_auto_day_end` so tonight's cron can still close if the manual close was before 23:59, then update `restaurant_settings.last_manual_end_at = now()` and recompute `next_scheduled_end_at`.
- Replace the toast with: "Books closed. Auto end-of-day will resume tomorrow at 11:59 PM".
- Never surface a "paused" state after a manual close.

### 3. Status badge + Resume button
New component `AutoEndOfDayBadge.tsx`, mounted in the Orders page header (top-right) and Dashboard header.

Reads `restaurant_settings.auto_end_of_day_enabled` + today's `daily_reports` row + business timezone to decide state:

- **Active** — green (`bg-accent2/15 text-accent2`) pill: "✓ Auto End-of-Day Active · Next: Today/Tomorrow at 11:59 PM" (local time, formatted with `date-fns`).
- **Paused** — muted pill + ghost "Resume Auto End-of-Day" button with `RotateCcw` icon.

Paused = `auto_end_of_day_enabled = false`. Resume flips it back to true, disables the button for 2s, toasts "Auto end-of-day resumed. Next close: [time]".

Badge styling: `px-3 py-1.5 rounded-full text-xs font-semibold` (matches the request's 6/12/20/12/600 tokens using Tailwind).

### 4. Admin/Settings toggle
Small "Auto End-of-Day" card in `AdminSettings.tsx`: switch bound to `auto_end_of_day_enabled`, subtitle showing next scheduled time and last manual close.

### 5. No new edge function
The `POST /api/end-of-day/restart-listener` idea maps to: flip `auto_end_of_day_enabled = true` + call `reset_auto_day_end`. Both are one Supabase RPC/update from the client under existing RLS, so no new endpoint is needed. The pg_cron function is the "listener" and it always runs — nothing to cancel or re-arm per business.

## Files touched

- `supabase/migrations/<new>.sql` — add 3 columns to `restaurant_settings`.
- `src/components/AutoEndOfDayBadge.tsx` — new, badge + resume button.
- `src/pages/OrderHistory.tsx` — mount badge in header, update manual-close flow + toast.
- `src/pages/Dashboard.tsx` — mount badge in header row.
- `src/pages/AdminSettings.tsx` — add toggle card.
- `src/hooks/useAutoEndDay.ts` — skip when `auto_end_of_day_enabled = false`.

## Technical notes

- Timezone comes from `restaurant_settings.timezone` (already used by the cron). "Next 23:59" is computed in that timezone via `Intl.DateTimeFormat` — same helper the cron uses.
- "Paused" is a pure UI signal for the user's own toggle; the server cron is always running, which is the actual failsafe. This is intentional and matches the "works 24/7" requirement.
- All timestamps stored as ISO 8601 (`timestamptz`).
- No changes to the existing manual close SQL path — we only append the settings write + RPC call.

## Out of scope

- Per-business listener processes (unnecessary; pg_cron covers all restaurants centrally).
- Notification when the automatic close fires (kept silent per the request's "Success" note).
