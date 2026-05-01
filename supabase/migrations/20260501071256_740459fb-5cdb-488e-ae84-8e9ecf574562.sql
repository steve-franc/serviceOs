-- =========================================================
-- 1. Superadmin helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'::app_role
  )
$$;

-- =========================================================
-- 2. Superadmin RLS policies on every tenant table
-- =========================================================

-- restaurants
DROP POLICY IF EXISTS "Superadmins manage restaurants" ON public.restaurants;
CREATE POLICY "Superadmins manage restaurants" ON public.restaurants
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- restaurant_settings
DROP POLICY IF EXISTS "Superadmins manage settings" ON public.restaurant_settings;
CREATE POLICY "Superadmins manage settings" ON public.restaurant_settings
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- restaurant_memberships
DROP POLICY IF EXISTS "Superadmins manage memberships" ON public.restaurant_memberships;
CREATE POLICY "Superadmins manage memberships" ON public.restaurant_memberships
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "Superadmins manage roles" ON public.user_roles;
CREATE POLICY "Superadmins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Superadmins view profiles" ON public.profiles;
CREATE POLICY "Superadmins view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "Superadmins update profiles" ON public.profiles;
CREATE POLICY "Superadmins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- orders
DROP POLICY IF EXISTS "Superadmins manage orders" ON public.orders;
CREATE POLICY "Superadmins manage orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- order_items
DROP POLICY IF EXISTS "Superadmins manage order items" ON public.order_items;
CREATE POLICY "Superadmins manage order items" ON public.order_items
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- menu_items
DROP POLICY IF EXISTS "Superadmins manage menu items" ON public.menu_items;
CREATE POLICY "Superadmins manage menu items" ON public.menu_items
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- menu_tags
DROP POLICY IF EXISTS "Superadmins manage menu tags" ON public.menu_tags;
CREATE POLICY "Superadmins manage menu tags" ON public.menu_tags
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- inventory
DROP POLICY IF EXISTS "Superadmins manage inventory" ON public.inventory;
CREATE POLICY "Superadmins manage inventory" ON public.inventory
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- daily_reports
DROP POLICY IF EXISTS "Superadmins manage daily reports" ON public.daily_reports;
CREATE POLICY "Superadmins manage daily reports" ON public.daily_reports
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- daily_expenses
DROP POLICY IF EXISTS "Superadmins manage daily expenses" ON public.daily_expenses;
CREATE POLICY "Superadmins manage daily expenses" ON public.daily_expenses
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- debtors
DROP POLICY IF EXISTS "Superadmins manage debtors" ON public.debtors;
CREATE POLICY "Superadmins manage debtors" ON public.debtors
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- tabs
DROP POLICY IF EXISTS "Superadmins manage tabs" ON public.tabs;
CREATE POLICY "Superadmins manage tabs" ON public.tabs
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- tab_items
DROP POLICY IF EXISTS "Superadmins manage tab items" ON public.tab_items;
CREATE POLICY "Superadmins manage tab items" ON public.tab_items
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- =========================================================
-- 3. Hide non-active restaurants from public ordering & block public order creation when on hold/archived
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_public_order(
  _restaurant_id uuid, _customer_name text, _customer_email text,
  _customer_phone text, _customer_location text, _payment_method text,
  _notes text, _items jsonb
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  _status text;
BEGIN
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant not configured'; END IF;
  IF btrim(COALESCE(_customer_name, '')) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF btrim(COALESCE(_payment_method, '')) = '' THEN RAISE EXCEPTION 'Payment method is required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Please add items to the order'; END IF;

  SELECT status INTO _status FROM public.restaurants WHERE id = _restaurant_id;
  IF _status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurant_settings rs WHERE rs.restaurant_id = _restaurant_id AND rs.allow_public_orders = true) THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id AND mi.is_available = true AND mi.is_public = true LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more menu items are unavailable'; END IF;
    IF _quantity = 0 AND _extra_units = 0 THEN RAISE EXCEPTION 'Each order item must include quantity or extra units'; END IF;
    IF _extra_units > 0 AND COALESCE(_menu_item.per_unit_price, 0) <= 0 THEN RAISE EXCEPTION 'Invalid extra units for menu item %', _menu_item.name; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);
    _total := _total + _subtotal;
  END LOOP;

  _order_number := public.get_next_order_number(_restaurant_id);

  INSERT INTO public.orders (id, staff_id, total, payment_method, notes, customer_name, customer_email, customer_phone, customer_location, is_public_order, currency, restaurant_id, order_number, discount_amount, status)
  VALUES (_order_id, '00000000-0000-0000-0000-000000000000', _total, _payment_method, NULLIF(btrim(COALESCE(_notes, '')), ''), btrim(_customer_name), NULLIF(btrim(COALESCE(_customer_email, '')), ''), NULLIF(btrim(COALESCE(_customer_phone, '')), ''), NULLIF(btrim(COALESCE(_customer_location, '')), ''), true, 'TRY', _restaurant_id, _order_number, 0, 'pending');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id AND mi.is_available = true AND mi.is_public = true LIMIT 1;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price, 0) * _extra_units);
    INSERT INTO public.order_items (order_id, menu_item_id, menu_item_name, quantity, extra_units, base_price_at_time, per_unit_price_at_time, price_at_time, subtotal)
    VALUES (_order_id, _menu_item.id, _menu_item.name, _quantity, _extra_units, _menu_item.base_price, _menu_item.per_unit_price, _menu_item.base_price, _subtotal);
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$function$;

-- staff order: block on hold/archived
CREATE OR REPLACE FUNCTION public.create_staff_order(
  _restaurant_id uuid, _payment_method text, _notes text,
  _discount_amount numeric, _customer_name text, _items jsonb,
  _payment_status text DEFAULT 'paid'::text
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  _status text;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant required'; END IF;
  IF btrim(COALESCE(_payment_method, '')) = '' THEN RAISE EXCEPTION 'Payment method required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  IF _ps NOT IN ('paid','unpaid') THEN _ps := 'paid'; END IF;

  SELECT status INTO _status FROM public.restaurants WHERE id = _restaurant_id;
  IF _status = 'on_hold' THEN
    RAISE EXCEPTION 'Restaurant is on hold. Please contact support.';
  ELSIF _status = 'archived' THEN
    RAISE EXCEPTION 'Restaurant is archived.';
  END IF;

  IF NOT (
    _restaurant_id = public.current_restaurant_id(_user_id)
    OR public.is_manager(_user_id, _restaurant_id)
    OR public.is_superadmin(_user_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
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

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::integer, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::integer, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
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

-- =========================================================
-- 4. Superadmin RPCs
-- =========================================================

CREATE OR REPLACE FUNCTION public.superadmin_overview()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN jsonb_build_object(
    'restaurants_total', (SELECT count(*) FROM public.restaurants),
    'restaurants_active', (SELECT count(*) FROM public.restaurants WHERE status='active'),
    'restaurants_on_hold', (SELECT count(*) FROM public.restaurants WHERE status='on_hold'),
    'restaurants_archived', (SELECT count(*) FROM public.restaurants WHERE status='archived'),
    'users_total', (SELECT count(*) FROM public.profiles),
    'orders_today', (SELECT count(*) FROM public.orders WHERE (created_at AT TIME ZONE 'Europe/Istanbul')::date = _today),
    'revenue_today', (SELECT COALESCE(sum(total),0) FROM public.orders WHERE status='confirmed' AND COALESCE(payment_status,'paid')='paid' AND (created_at AT TIME ZONE 'Europe/Istanbul')::date = _today),
    'orders_total', (SELECT count(*) FROM public.orders),
    'revenue_total', (SELECT COALESCE(sum(total),0) FROM public.orders WHERE status='confirmed' AND COALESCE(payment_status,'paid')='paid')
  );
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_list_restaurants()
RETURNS TABLE(
  id uuid, name text, status text, created_at timestamptz, created_by uuid,
  staff_count int, orders_count int, revenue numeric, last_order_at timestamptz, logo_url text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT
    r.id, r.name, r.status, r.created_at, r.created_by,
    COALESCE((SELECT count(*)::int FROM public.restaurant_memberships m WHERE m.restaurant_id = r.id), 0),
    COALESCE((SELECT count(*)::int FROM public.orders o WHERE o.restaurant_id = r.id), 0),
    COALESCE((SELECT sum(o.total) FROM public.orders o WHERE o.restaurant_id = r.id AND o.status='confirmed' AND COALESCE(o.payment_status,'paid')='paid'), 0)::numeric,
    (SELECT max(o.created_at) FROM public.orders o WHERE o.restaurant_id = r.id),
    (SELECT rs.logo_url FROM public.restaurant_settings rs WHERE rs.restaurant_id = r.id LIMIT 1)
  FROM public.restaurants r
  ORDER BY r.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_get_restaurant(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r record; _staff jsonb; _recent_orders jsonb;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO _r FROM public.restaurants WHERE id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant not found'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'full_name', p.full_name,
    'role', (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = m.user_id AND ur.restaurant_id = _restaurant_id ORDER BY ur.created_at DESC LIMIT 1),
    'joined_at', m.created_at
  ) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO _staff
  FROM public.restaurant_memberships m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.restaurant_id = _restaurant_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'total', o.total,
    'payment_method', o.payment_method, 'status', o.status,
    'payment_status', o.payment_status, 'created_at', o.created_at,
    'is_public_order', o.is_public_order
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO _recent_orders
  FROM (SELECT * FROM public.orders WHERE restaurant_id = _restaurant_id ORDER BY created_at DESC LIMIT 25) o;

  RETURN jsonb_build_object(
    'restaurant', to_jsonb(_r),
    'settings', (SELECT to_jsonb(rs) FROM public.restaurant_settings rs WHERE rs.restaurant_id = _restaurant_id LIMIT 1),
    'staff', _staff,
    'recent_orders', _recent_orders,
    'totals', jsonb_build_object(
      'orders', (SELECT count(*) FROM public.orders WHERE restaurant_id = _restaurant_id),
      'revenue', (SELECT COALESCE(sum(total),0) FROM public.orders WHERE restaurant_id = _restaurant_id AND status='confirmed' AND COALESCE(payment_status,'paid')='paid'),
      'menu_items', (SELECT count(*) FROM public.menu_items WHERE restaurant_id = _restaurant_id),
      'inventory_items', (SELECT count(*) FROM public.inventory WHERE restaurant_id = _restaurant_id),
      'open_tabs', (SELECT count(*) FROM public.tabs WHERE restaurant_id = _restaurant_id AND status='open'),
      'unresolved_debt', (SELECT COALESCE(sum(amount_owed),0) FROM public.debtors WHERE restaurant_id = _restaurant_id AND is_resolved = false)
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_set_restaurant_status(_restaurant_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _status NOT IN ('active','on_hold','archived') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.restaurants SET status = _status WHERE id = _restaurant_id;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_purge_restaurant(_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _status text;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT status INTO _status FROM public.restaurants WHERE id = _restaurant_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'Restaurant not found'; END IF;
  IF _status <> 'archived' THEN RAISE EXCEPTION 'Restaurant must be archived before purging'; END IF;

  DELETE FROM public.tab_items WHERE tab_id IN (SELECT id FROM public.tabs WHERE restaurant_id = _restaurant_id);
  DELETE FROM public.tabs WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE restaurant_id = _restaurant_id);
  DELETE FROM public.orders WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.daily_reports WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.daily_expenses WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.debtors WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.menu_items WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.menu_tags WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.inventory WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.restaurant_settings WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.user_roles WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.restaurant_memberships WHERE restaurant_id = _restaurant_id;
  DELETE FROM public.restaurants WHERE id = _restaurant_id;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_remove_staff(_user_id uuid, _restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND restaurant_id = _restaurant_id;
  DELETE FROM public.restaurant_memberships WHERE user_id = _user_id AND restaurant_id = _restaurant_id;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_change_role(_user_id uuid, _restaurant_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _role NOT IN ('manager','ops','counter','server','investor') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND restaurant_id = _restaurant_id;
  INSERT INTO public.user_roles (user_id, role, restaurant_id) VALUES (_user_id, _role::app_role, _restaurant_id);
  INSERT INTO public.restaurant_memberships (user_id, restaurant_id) VALUES (_user_id, _restaurant_id) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_list_users()
RETURNS TABLE(user_id uuid, full_name text, created_at timestamptz, restaurants jsonb, is_superadmin boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.created_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'restaurant_id', m.restaurant_id,
        'restaurant_name', r.name,
        'role', (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.restaurant_id = m.restaurant_id ORDER BY ur.created_at DESC LIMIT 1)
      ))
      FROM public.restaurant_memberships m
      LEFT JOIN public.restaurants r ON r.id = m.restaurant_id
      WHERE m.user_id = p.id
    ), '[]'::jsonb),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'superadmin'::app_role)
  FROM public.profiles p
  ORDER BY p.created_at DESC;
END $$;
