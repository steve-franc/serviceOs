ALTER TABLE public.order_items DROP CONSTRAINT order_items_quantity_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity >= 0);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_qty_or_units_check CHECK (quantity > 0 OR COALESCE(extra_units, 0) > 0);