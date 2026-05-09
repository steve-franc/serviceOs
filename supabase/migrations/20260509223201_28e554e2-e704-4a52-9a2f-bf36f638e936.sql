-- 1. Add columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_via_debtor_id uuid;

-- Backfill paid_at for existing paid orders
UPDATE public.orders
   SET paid_at = created_at
 WHERE payment_status = 'paid' AND paid_at IS NULL;

-- 2. Add source_order_id to debtors
ALTER TABLE public.debtors
  ADD COLUMN IF NOT EXISTS source_order_id uuid;

CREATE INDEX IF NOT EXISTS idx_debtors_source_order ON public.debtors(source_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON public.orders(paid_at);

-- 3. Trigger to keep paid_at in sync with payment_status
CREATE OR REPLACE FUNCTION public.sync_order_paid_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status = 'paid' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := NEW.created_at;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      IF NEW.payment_status = 'paid' THEN
        NEW.paid_at := COALESCE(NEW.paid_at, now());
      ELSE
        NEW.paid_at := NULL;
        NEW.paid_via_debtor_id := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_paid_at ON public.orders;
CREATE TRIGGER trg_sync_order_paid_at
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_order_paid_at();