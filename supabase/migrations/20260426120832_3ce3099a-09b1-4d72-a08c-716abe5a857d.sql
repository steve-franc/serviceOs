-- Atomic staff order creation: order + order_items inserted in a single transaction.
-- If any item insert fails, the whole order is rolled back (no orphan orders).
CREATE OR REPLACE FUNCTION public.create_staff_order(
  _restaurant_id uuid,
  _payment_method text,
  _notes text,
  _discount_amount numeric,
  _customer_name text,
  _items jsonb,
  _payment_status text DEFAULT 'paid'
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _order_id uuid := gen_random_uuid();
  _order_number text;
  _total numeric := 0;
  _subtotal_total numeric := 0;
  _item jsonb;
  _menu_item public.menu_items%ROWTYPE;
  _quantity integer;
  _extra_units integer;
  _subtotal numeric;
  _user_id uuid := auth.uid();
  _final_total numeric;
  _disc numeric := COALESCE(_discount_amount, 0);
  _ps text := COALESCE(NULLIF(btrim(_payment_status), ''), 'paid');
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant required'; END IF;
  IF btrim(COALESCE(_payment_method, '')) = '' THEN RAISE EXCEPTION 'Payment method required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  IF _ps NOT IN ('paid','unpaid') THEN _ps := 'paid'; END IF;

  -- Verify membership / role
  IF NOT (
    _restaurant_id = public.current_restaurant_id(_user_id)
    OR public.is_manager(_user_id, _restaurant_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this restaurant';
  END IF;

  -- Compute subtotals server-side
  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item
      FROM public.menu_items mi
     WHERE mi.id = (_item->>'menu_item_id')::uuid
       AND mi.restaurant_id = _restaurant_id
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
    IF _quantity = 0 AND _extra_units = 0 THEN RAISE EXCEPTION 'Each item must have quantity or extra units'; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);
    _subtotal_total := _subtotal_total + _subtotal;
  END LOOP;

  IF _disc < 0 THEN _disc := 0; END IF;
  IF _disc > _subtotal_total THEN _disc := _subtotal_total; END IF;
  _final_total := _subtotal_total - _disc;

  _order_number := public.get_next_order_number(_restaurant_id);

  INSERT INTO public.orders (
    id, staff_id, total, payment_method, notes, currency, is_public_order,
    restaurant_id, order_number, discount_amount, status, customer_name, payment_status
  ) VALUES (
    _order_id, _user_id, _final_total, _payment_method,
    NULLIF(btrim(COALESCE(_notes, '')), ''), 'TRY', false,
    _restaurant_id, _order_number, _disc, 'confirmed',
    NULLIF(btrim(COALESCE(_customer_name, '')), ''), _ps
  );

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item
      FROM public.menu_items mi
     WHERE mi.id = (_item->>'menu_item_id')::uuid
       AND mi.restaurant_id = _restaurant_id
     LIMIT 1;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);

    INSERT INTO public.order_items (
      order_id, menu_item_id, menu_item_name, quantity, extra_units,
      base_price_at_time, per_unit_price_at_time, price_at_time, subtotal
    ) VALUES (
      _order_id, _menu_item.id, _menu_item.name, _quantity, _extra_units,
      _menu_item.base_price, _menu_item.per_unit_price, _menu_item.base_price, _subtotal
    );
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$function$;

-- Cleanup: remove any pre-existing orphan orders that have no items
-- (Best-effort hygiene; safe to run repeatedly.)
DELETE FROM public.orders o
 WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id)
   AND o.is_public_order = false
   AND o.status = 'confirmed'
   AND o.created_at < now() - interval '1 minute';