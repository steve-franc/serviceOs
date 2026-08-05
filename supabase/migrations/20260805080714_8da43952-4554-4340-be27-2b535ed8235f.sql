ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_bills_restaurant ON public.bills(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(restaurant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON public.bills(restaurant_id, due_date);