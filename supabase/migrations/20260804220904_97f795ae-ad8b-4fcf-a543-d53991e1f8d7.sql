CREATE TABLE IF NOT EXISTS public.payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  salary_amount numeric(12,2) NOT NULL,
  payment_status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  paid_by uuid,
  expense_id uuid REFERENCES public.daily_expenses(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, staff_id, entry_date),
  CHECK (payment_status IN ('paid','unpaid'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_restaurant_date ON public.payroll_entries(restaurant_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_status ON public.payroll_entries(restaurant_id, payment_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_entries TO authenticated;
GRANT ALL ON public.payroll_entries TO service_role;

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and ops manage payroll"
ON public.payroll_entries
FOR ALL
TO authenticated
USING (public.is_manager_or_ops(auth.uid(), restaurant_id) OR public.is_superadmin(auth.uid()))
WITH CHECK (public.is_manager_or_ops(auth.uid(), restaurant_id) OR public.is_superadmin(auth.uid()));

CREATE TRIGGER update_payroll_entries_updated_at
BEFORE UPDATE ON public.payroll_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();