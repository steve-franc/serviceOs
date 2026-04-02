CREATE OR REPLACE FUNCTION public.create_public_order(
  _restaurant_id uuid,
  _customer_name text,
  _customer_email text,
  _payment_method text,
  _notes text,
  _items jsonb
)
RETURNS TABLE(id uuid, order_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_id uuid := gen_random_uuid();
  _order_number integer;
  _total numeric := 0;
  _item jsonb;
  _menu_item public.menu_items%ROWTYPE;
  _quantity integer;
  _extra_units integer;
  _subtotal numeric;
BEGIN
  IF _restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant not configured';
  END IF;

  IF btrim(COALESCE(_customer_name, '')) = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF btrim(COALESCE(_payment_method, '')) = '' THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Please add items to the order';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurant_settings rs
    WHERE rs.restaurant_id = _restaurant_id
      AND rs.allow_public_orders = true
  ) THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);

    SELECT * INTO _menu_item
    FROM public.menu_items
    WHERE id = (_item->>'menu_item_id')::uuid
      AND restaurant_id = _restaurant_id
      AND is_available = true
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'One or more menu items are unavailable';
    END IF;

    IF _quantity = 0 AND _extra_units = 0 THEN
      RAISE EXCEPTION 'Each order item must include quantity or extra units';
    END IF;

    IF _extra_units > 0 AND COALESCE(_menu_item.per_unit_price, 0) <= 0 THEN
      RAISE EXCEPTION 'Invalid extra units for menu item %', _menu_item.name;
    END IF;

    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);
    _total := _total + _subtotal;
  END LOOP;

  _order_number := public.get_next_order_number(_restaurant_id);

  INSERT INTO public.orders (
    id,
    staff_id,
    total,
    payment_method,
    notes,
    customer_name,
    customer_email,
    is_public_order,
    currency,
    restaurant_id,
    order_number,
    discount_amount
  ) VALUES (
    _order_id,
    '00000000-0000-0000-0000-000000000000',
    _total,
    _payment_method,
    NULLIF(btrim(COALESCE(_notes, '')), ''),
    btrim(_customer_name),
    NULLIF(btrim(COALESCE(_customer_email, '')), ''),
    true,
    'TRY',
    _restaurant_id,
    _order_number,
    0
  );

  FOR _item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);

    SELECT * INTO _menu_item
    FROM public.menu_items
    WHERE id = (_item->>'menu_item_id')::uuid
      AND restaurant_id = _restaurant_id
      AND is_available = true
    LIMIT 1;

    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);

    INSERT INTO public.order_items (
      order_id,
      menu_item_id,
      menu_item_name,
      quantity,
      extra_units,
      base_price_at_time,
      per_unit_price_at_time,
      price_at_time,
      subtotal
    ) VALUES (
      _order_id,
      _menu_item.id,
      _menu_item.name,
      _quantity,
      _extra_units,
      _menu_item.base_price,
      _menu_item.per_unit_price,
      _menu_item.base_price,
      _subtotal
    );
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_order(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_receipt(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order_record RECORD;
  _items jsonb;
BEGIN
  SELECT
    o.id,
    o.order_number,
    o.total,
    o.payment_method,
    o.notes,
    o.created_at,
    o.currency,
    o.edited_at,
    o.discount_amount
  INTO _order_record
  FROM public.orders o
  WHERE o.id = _order_id
    AND o.is_public_order = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'menu_item_name', oi.menu_item_name,
        'quantity', oi.quantity,
        'price_at_time', oi.price_at_time,
        'subtotal', oi.subtotal,
        'extra_units', oi.extra_units,
        'base_price_at_time', oi.base_price_at_time,
        'per_unit_price_at_time', oi.per_unit_price_at_time
      )
      ORDER BY oi.id
    ),
    '[]'::jsonb
  )
  INTO _items
  FROM public.order_items oi
  WHERE oi.order_id = _order_id;

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', _order_record.id,
      'order_number', _order_record.order_number,
      'total', _order_record.total,
      'payment_method', _order_record.payment_method,
      'notes', _order_record.notes,
      'created_at', _order_record.created_at,
      'currency', _order_record.currency,
      'edited_at', _order_record.edited_at,
      'discount_amount', _order_record.discount_amount
    ),
    'items', _items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(uuid) TO anon, authenticated;