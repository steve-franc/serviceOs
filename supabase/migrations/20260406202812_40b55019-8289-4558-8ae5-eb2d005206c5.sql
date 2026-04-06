
-- Drop trigger first, then functions
DROP TRIGGER IF EXISTS set_order_number_trigger ON public.orders;
DROP FUNCTION IF EXISTS public.create_public_order(uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.set_order_number() CASCADE;
DROP FUNCTION IF EXISTS public.get_next_order_number(uuid);

-- Change order_number column from integer to text
ALTER TABLE public.orders ALTER COLUMN order_number TYPE text USING order_number::text;
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT '';

-- Recreate get_next_order_number returning text
CREATE OR REPLACE FUNCTION public.get_next_order_number(_restaurant_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _code text;
  _exists boolean;
BEGIN
  LOOP
    _code := upper(substr(md5(gen_random_uuid()::text), 1, 4));
    SELECT EXISTS (
      SELECT 1 FROM public.orders
      WHERE restaurant_id = _restaurant_id AND order_number = _code
    ) INTO _exists;
    EXIT WHEN NOT _exists;
  END LOOP;
  RETURN _code;
END;
$function$;

-- Recreate set_order_number trigger function
CREATE OR REPLACE FUNCTION public.set_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.order_number := public.get_next_order_number(NEW.restaurant_id);
  RETURN NEW;
END;
$function$;

-- Recreate trigger
CREATE TRIGGER set_order_number_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();

-- Recreate create_public_order with text order_number
CREATE OR REPLACE FUNCTION public.create_public_order(_restaurant_id uuid, _customer_name text, _customer_email text, _payment_method text, _notes text, _items jsonb)
 RETURNS TABLE(id uuid, order_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order_id uuid := gen_random_uuid();
  _order_number text;
  _total numeric := 0;
  _item jsonb;
  _menu_item public.menu_items%ROWTYPE;
  _quantity integer;
  _extra_units integer;
  _subtotal numeric;
BEGIN
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant not configured'; END IF;
  IF btrim(COALESCE(_customer_name, '')) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF btrim(COALESCE(_payment_method, '')) = '' THEN RAISE EXCEPTION 'Payment method is required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Please add items to the order'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurant_settings rs WHERE rs.restaurant_id = _restaurant_id AND rs.allow_public_orders = true) THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id AND mi.is_available = true LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more menu items are unavailable'; END IF;
    IF _quantity = 0 AND _extra_units = 0 THEN RAISE EXCEPTION 'Each order item must include quantity or extra units'; END IF;
    IF _extra_units > 0 AND COALESCE(_menu_item.per_unit_price, 0) <= 0 THEN RAISE EXCEPTION 'Invalid extra units for menu item %', _menu_item.name; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);
    _total := _total + _subtotal;
  END LOOP;

  _order_number := public.get_next_order_number(_restaurant_id);

  INSERT INTO public.orders (id, staff_id, total, payment_method, notes, customer_name, customer_email, is_public_order, currency, restaurant_id, order_number, discount_amount, status)
  VALUES (_order_id, '00000000-0000-0000-0000-000000000000', _total, _payment_method, NULLIF(btrim(COALESCE(_notes, '')), ''), btrim(_customer_name), NULLIF(btrim(COALESCE(_customer_email, '')), ''), true, 'TRY', _restaurant_id, _order_number, 0, 'pending');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id AND mi.is_available = true LIMIT 1;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);
    INSERT INTO public.order_items (order_id, menu_item_id, menu_item_name, quantity, extra_units, base_price_at_time, per_unit_price_at_time, price_at_time, subtotal)
    VALUES (_order_id, _menu_item.id, _menu_item.name, _quantity, _extra_units, _menu_item.base_price, _menu_item.per_unit_price, _menu_item.base_price, _subtotal);
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$function$;
