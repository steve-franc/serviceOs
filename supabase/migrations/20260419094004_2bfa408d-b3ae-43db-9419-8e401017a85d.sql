
-- 1. Add link column on menu_items
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_items_inventory_id ON public.menu_items(inventory_id);

-- 2. Trigger: when a menu item is saved as inventory_item, ensure a linked inventory row exists
CREATE OR REPLACE FUNCTION public.sync_menu_item_to_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_id uuid;
  _status inventory_status;
BEGIN
  IF NEW.is_inventory_item = false THEN
    RETURN NEW;
  END IF;

  -- Determine status from stock_qty
  _status := CASE
    WHEN COALESCE(NEW.stock_qty,0) <= 0 THEN 'finished'::inventory_status
    WHEN COALESCE(NEW.stock_qty,0) <= 5 THEN 'almost_finished'::inventory_status
    ELSE 'available'::inventory_status
  END;

  -- If already linked, update that inventory row's quantity/status
  IF NEW.inventory_id IS NOT NULL THEN
    UPDATE public.inventory
       SET quantity = NEW.stock_qty,
           status = _status,
           updated_at = now()
     WHERE id = NEW.inventory_id;
    RETURN NEW;
  END IF;

  -- Try to find existing inventory row by name within the same restaurant
  SELECT id INTO _inv_id
    FROM public.inventory
   WHERE restaurant_id = NEW.restaurant_id
     AND lower(name) = lower(NEW.name)
   LIMIT 1;

  IF _inv_id IS NULL THEN
    INSERT INTO public.inventory (name, restaurant_id, quantity, unit, status)
    VALUES (NEW.name, NEW.restaurant_id, NEW.stock_qty, 'units', _status)
    RETURNING id INTO _inv_id;
  ELSE
    UPDATE public.inventory
       SET quantity = NEW.stock_qty,
           status = _status,
           updated_at = now()
     WHERE id = _inv_id;
  END IF;

  -- Update the row we just inserted/updated so it has the link without re-firing
  NEW.inventory_id := _inv_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_item_sync_inventory ON public.menu_items;
CREATE TRIGGER trg_menu_item_sync_inventory
BEFORE INSERT OR UPDATE OF is_inventory_item, stock_qty, name, inventory_id
ON public.menu_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_menu_item_to_inventory();

-- 3. Trigger: when an inventory row's quantity changes, sync linked menu_items.stock_qty
CREATE OR REPLACE FUNCTION public.sync_inventory_to_menu_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.menu_items
       SET stock_qty = GREATEST(FLOOR(NEW.quantity)::int, 0),
           is_available = CASE WHEN NEW.quantity > 0 AND NEW.status <> 'finished' THEN true ELSE false END,
           updated_at = now()
     WHERE inventory_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_sync_menu_item ON public.inventory;
CREATE TRIGGER trg_inventory_sync_menu_item
AFTER UPDATE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_to_menu_item();

-- 4. Update existing decrement_menu_item_stock trigger to also push to inventory
CREATE OR REPLACE FUNCTION public.decrement_menu_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv_id uuid;
  _new_qty numeric;
BEGIN
  -- decrement menu item stock
  UPDATE public.menu_items
     SET stock_qty = GREATEST(stock_qty - NEW.quantity, 0),
         is_available = CASE WHEN (stock_qty - NEW.quantity) > 0 THEN true ELSE false END
   WHERE id = NEW.menu_item_id
     AND is_inventory_item = true
  RETURNING inventory_id, stock_qty INTO _inv_id, _new_qty;

  -- mirror to inventory table if linked
  IF _inv_id IS NOT NULL THEN
    UPDATE public.inventory
       SET quantity = _new_qty,
           status = CASE
             WHEN _new_qty <= 0 THEN 'finished'::inventory_status
             WHEN _new_qty <= 5 THEN 'almost_finished'::inventory_status
             ELSE 'available'::inventory_status
           END,
           updated_at = now()
     WHERE id = _inv_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Backfill existing inventory-tracked menu items
DO $$
DECLARE
  r RECORD;
  _inv_id uuid;
  _status inventory_status;
BEGIN
  FOR r IN SELECT * FROM public.menu_items WHERE is_inventory_item = true AND inventory_id IS NULL LOOP
    _status := CASE
      WHEN COALESCE(r.stock_qty,0) <= 0 THEN 'finished'::inventory_status
      WHEN COALESCE(r.stock_qty,0) <= 5 THEN 'almost_finished'::inventory_status
      ELSE 'available'::inventory_status
    END;

    SELECT id INTO _inv_id FROM public.inventory
     WHERE restaurant_id = r.restaurant_id AND lower(name) = lower(r.name) LIMIT 1;

    IF _inv_id IS NULL THEN
      INSERT INTO public.inventory (name, restaurant_id, quantity, unit, status)
      VALUES (r.name, r.restaurant_id, r.stock_qty, 'units', _status)
      RETURNING id INTO _inv_id;
    END IF;

    UPDATE public.menu_items SET inventory_id = _inv_id WHERE id = r.id;
  END LOOP;
END $$;
