-- Fix 4: payment method on restock entries
ALTER TABLE public.restock_entries
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

ALTER TABLE public.restock_entries
  DROP CONSTRAINT IF EXISTS restock_entries_payment_method_check;
ALTER TABLE public.restock_entries
  ADD CONSTRAINT restock_entries_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash','bank_transfer','check','credit','mobile_money','other'));

-- Fix 2: staff salaries
CREATE TABLE IF NOT EXISTS public.staff_salaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_frequency text NOT NULL DEFAULT 'monthly',
  payment_status text NOT NULL DEFAULT 'unpaid',
  due_date date,
  paid_date timestamptz,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_salaries_frequency_check CHECK (payment_frequency IN ('daily','weekly','monthly')),
  CONSTRAINT staff_salaries_status_check CHECK (payment_status IN ('paid','unpaid'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_salaries TO authenticated;
GRANT ALL ON public.staff_salaries TO service_role;

ALTER TABLE public.staff_salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage salaries in their restaurant"
ON public.staff_salaries FOR ALL TO authenticated
USING (public.is_manager(auth.uid(), restaurant_id))
WITH CHECK (public.is_manager(auth.uid(), restaurant_id));

CREATE INDEX IF NOT EXISTS idx_staff_salaries_restaurant ON public.staff_salaries(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_status ON public.staff_salaries(restaurant_id, payment_status);

CREATE TRIGGER update_staff_salaries_updated_at
BEFORE UPDATE ON public.staff_salaries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();