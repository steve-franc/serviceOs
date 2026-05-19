
-- =========================================================
-- SUPPLIERS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  supplier_name text NOT NULL,
  contact_person text,
  phone_number text,
  email text,
  whatsapp_number text,
  address text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_restaurant ON public.suppliers(restaurant_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view suppliers" ON public.suppliers FOR SELECT
USING (auth.uid() IS NOT NULL AND (restaurant_id = current_restaurant_id(auth.uid()) OR is_manager(auth.uid(), restaurant_id) OR is_investor(auth.uid(), restaurant_id)));

CREATE POLICY "Managers/ops manage suppliers" ON public.suppliers FOR ALL
USING (is_manager_or_ops(auth.uid(), restaurant_id) AND restaurant_id = current_restaurant_id(auth.uid()))
WITH CHECK (is_manager_or_ops(auth.uid(), restaurant_id) AND restaurant_id = current_restaurant_id(auth.uid()));

CREATE POLICY "Superadmins manage suppliers" ON public.suppliers FOR ALL
USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- RESTOCK ENTRIES
-- =========================================================
CREATE TABLE IF NOT EXISTS public.restock_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  supplier_id uuid,
  quantity_purchased numeric NOT NULL CHECK (quantity_purchased > 0),
  unit_type text NOT NULL DEFAULT 'units',
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_cost numeric NOT NULL CHECK (total_cost >= 0),
  purchase_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Istanbul')::date,
  invoice_image_url text,
  notes text,
  daily_expense_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restock_restaurant ON public.restock_entries(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restock_item ON public.restock_entries(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_restock_supplier ON public.restock_entries(supplier_id);
CREATE INDEX IF NOT EXISTS idx_restock_date ON public.restock_entries(purchase_date DESC);

ALTER TABLE public.restock_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view restock" ON public.restock_entries FOR SELECT
USING (auth.uid() IS NOT NULL AND (restaurant_id = current_restaurant_id(auth.uid()) OR is_manager(auth.uid(), restaurant_id) OR is_investor(auth.uid(), restaurant_id)));

CREATE POLICY "Managers/ops manage restock" ON public.restock_entries FOR ALL
USING (is_manager_or_ops(auth.uid(), restaurant_id) AND restaurant_id = current_restaurant_id(auth.uid()))
WITH CHECK (is_manager_or_ops(auth.uid(), restaurant_id) AND restaurant_id = current_restaurant_id(auth.uid()));

CREATE POLICY "Superadmins manage restock" ON public.restock_entries FOR ALL
USING (is_superadmin(auth.uid())) WITH CHECK (is_superadmin(auth.uid()));

CREATE TRIGGER update_restock_updated_at
BEFORE UPDATE ON public.restock_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Trigger: auto-log expense + bump inventory on insert
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_restock_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_name text;
  _sup_name text;
  _exp_id uuid;
  _desc text;
BEGIN
  SELECT name INTO _inv_name FROM public.inventory WHERE id = NEW.inventory_item_id;
  IF NEW.supplier_id IS NOT NULL THEN
    SELECT supplier_name INTO _sup_name FROM public.suppliers WHERE id = NEW.supplier_id;
  END IF;

  _desc := 'Restock: ' || COALESCE(_inv_name,'item') || ' (' || NEW.quantity_purchased || ' ' || NEW.unit_type || ')'
        || CASE WHEN _sup_name IS NOT NULL THEN ' — ' || _sup_name ELSE '' END;

  INSERT INTO public.daily_expenses (restaurant_id, staff_id, amount, description, category, source)
  VALUES (NEW.restaurant_id, COALESCE(NEW.created_by, auth.uid()), NEW.total_cost, _desc, 'Restock', 'restock')
  RETURNING id INTO _exp_id;

  NEW.daily_expense_id := _exp_id;

  -- Bump inventory quantity
  UPDATE public.inventory
     SET quantity = COALESCE(quantity,0) + NEW.quantity_purchased,
         status = CASE
           WHEN COALESCE(quantity,0) + NEW.quantity_purchased <= 0 THEN 'finished'::inventory_status
           WHEN COALESCE(quantity,0) + NEW.quantity_purchased <= 5 THEN 'almost_finished'::inventory_status
           ELSE 'available'::inventory_status
         END,
         updated_at = now()
   WHERE id = NEW.inventory_item_id;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_restock_insert
BEFORE INSERT ON public.restock_entries
FOR EACH ROW EXECUTE FUNCTION public.handle_restock_insert();

-- Cleanup expense when restock is deleted
CREATE OR REPLACE FUNCTION public.handle_restock_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.daily_expense_id IS NOT NULL THEN
    DELETE FROM public.daily_expenses WHERE id = OLD.daily_expense_id;
  END IF;
  UPDATE public.inventory
     SET quantity = GREATEST(COALESCE(quantity,0) - OLD.quantity_purchased, 0),
         updated_at = now()
   WHERE id = OLD.inventory_item_id;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_restock_delete
AFTER DELETE ON public.restock_entries
FOR EACH ROW EXECUTE FUNCTION public.handle_restock_delete();

-- =========================================================
-- Storage bucket for invoice images
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('restock-invoices', 'restock-invoices', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read restock invoices" ON storage.objects FOR SELECT
USING (bucket_id = 'restock-invoices');

CREATE POLICY "Auth upload restock invoices" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'restock-invoices' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth update restock invoices" ON storage.objects FOR UPDATE
USING (bucket_id = 'restock-invoices' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth delete restock invoices" ON storage.objects FOR DELETE
USING (bucket_id = 'restock-invoices' AND auth.uid() IS NOT NULL);
