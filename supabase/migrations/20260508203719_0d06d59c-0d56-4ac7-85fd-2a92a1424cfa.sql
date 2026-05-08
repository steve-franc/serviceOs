-- 1. Workday notes table
CREATE TABLE public.workday_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  body text NOT NULL,
  applies_to_report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workday_notes_restaurant_created ON public.workday_notes(restaurant_id, created_at DESC);
CREATE INDEX idx_workday_notes_report ON public.workday_notes(applies_to_report_id);

ALTER TABLE public.workday_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members can view workday notes"
  ON public.workday_notes FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (restaurant_id = current_restaurant_id(auth.uid()) OR is_manager(auth.uid(), restaurant_id))
  );

CREATE POLICY "Investors can view workday notes"
  ON public.workday_notes FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_investor(auth.uid(), restaurant_id));

CREATE POLICY "Staff can create workday notes"
  ON public.workday_notes FOR INSERT
  WITH CHECK (auth.uid() = staff_id AND restaurant_id = current_restaurant_id(auth.uid()));

CREATE POLICY "Staff can delete own notes; managers can delete any"
  ON public.workday_notes FOR DELETE
  USING (
    (auth.uid() = staff_id AND restaurant_id = current_restaurant_id(auth.uid()))
    OR is_manager(auth.uid(), restaurant_id)
  );

CREATE POLICY "Superadmins manage workday notes"
  ON public.workday_notes FOR ALL
  TO authenticated
  USING (is_superadmin(auth.uid()))
  WITH CHECK (is_superadmin(auth.uid()));

-- 2. Custom pricing units stored on restaurant_settings
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS pricing_units jsonb NOT NULL
  DEFAULT '["per piece","per scoop","per serving","per bowl","per kg","per gram","per hour"]'::jsonb;

-- 3. Make per-unit-only orders possible: allow base_price of 0
-- (column already allows 0 by default; nothing to alter at DB level)
