
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS auto_end_of_day_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_manual_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_scheduled_end_at timestamptz;
