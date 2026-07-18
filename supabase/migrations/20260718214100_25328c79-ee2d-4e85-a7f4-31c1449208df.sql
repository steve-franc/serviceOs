
-- Feature 1: payment status on restock_entries
ALTER TABLE public.restock_entries
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS marked_paid_by uuid;

DO $$ BEGIN
  ALTER TABLE public.restock_entries
    ADD CONSTRAINT restock_payment_status_chk CHECK (payment_status IN ('paid','unpaid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_restock_payment_status
  ON public.restock_entries(restaurant_id, payment_status);

-- Feature 2: bills table
CREATE TABLE IF NOT EXISTS public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name text,
  description text,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  original_amount numeric(12,2),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid','unpaid')),
  due_date date,
  edited_by uuid,
  edited_at timestamptz,
  marked_paid_at timestamptz,
  marked_paid_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view bills" ON public.bills FOR SELECT
  USING (auth.uid() IS NOT NULL AND (
    restaurant_id = public.current_restaurant_id(auth.uid())
    OR public.is_manager(auth.uid(), restaurant_id)
    OR public.is_investor(auth.uid(), restaurant_id)
  ));

CREATE POLICY "Managers/ops manage bills" ON public.bills FOR ALL
  USING (public.is_manager_or_ops(auth.uid(), restaurant_id)
         AND restaurant_id = public.current_restaurant_id(auth.uid()))
  WITH CHECK (public.is_manager_or_ops(auth.uid(), restaurant_id)
              AND restaurant_id = public.current_restaurant_id(auth.uid()));

CREATE POLICY "Superadmins manage bills" ON public.bills FOR ALL
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bills_restaurant ON public.bills(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_payment_status ON public.bills(restaurant_id, payment_status);

DROP TRIGGER IF EXISTS update_bills_updated_at ON public.bills;
CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
