-- 1. Extend menu_items with service fields
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS slot_capacity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_booking_days integer NOT NULL DEFAULT 30;

-- 2. Weekly recurring availability windows per service
CREATE TABLE IF NOT EXISTS public.service_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_availability_menu_item ON public.service_availability(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_service_availability_restaurant ON public.service_availability(restaurant_id);

ALTER TABLE public.service_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view availability for public services"
  ON public.service_availability FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = service_availability.menu_item_id
        AND mi.is_public = true
        AND mi.is_available = true
    )
  );

CREATE POLICY "Restaurant members view availability"
  ON public.service_availability FOR SELECT
  USING (auth.uid() IS NOT NULL AND (restaurant_id = public.current_restaurant_id(auth.uid()) OR public.is_manager(auth.uid(), restaurant_id)));

CREATE POLICY "Managers and ops manage availability"
  ON public.service_availability FOR ALL
  USING (public.is_manager_or_ops(auth.uid(), restaurant_id))
  WITH CHECK (public.is_manager_or_ops(auth.uid(), restaurant_id));

CREATE POLICY "Superadmins manage availability"
  ON public.service_availability FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- 3. Service bookings (one per booked slot)
CREATE TABLE IF NOT EXISTS public.service_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  menu_item_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  customer_name text,
  customer_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_start ON public.service_bookings(restaurant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_menu_start ON public.service_bookings(menu_item_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_order ON public.service_bookings(order_id);

ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Restaurant members view bookings"
  ON public.service_bookings FOR SELECT
  USING (auth.uid() IS NOT NULL AND (restaurant_id = public.current_restaurant_id(auth.uid()) OR public.is_manager(auth.uid(), restaurant_id)));

CREATE POLICY "Investors view bookings"
  ON public.service_bookings FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

CREATE POLICY "Restaurant members update bookings"
  ON public.service_bookings FOR UPDATE
  USING (auth.uid() IS NOT NULL AND (restaurant_id = public.current_restaurant_id(auth.uid()) OR public.is_manager(auth.uid(), restaurant_id)));

CREATE POLICY "Superadmins manage bookings"
  ON public.service_bookings FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_service_bookings_updated_at
  BEFORE UPDATE ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RPC: get available slots for a service in a date range
CREATE OR REPLACE FUNCTION public.get_available_slots(
  _menu_item_id uuid,
  _from date,
  _to date
)
RETURNS TABLE(start_at timestamptz, end_at timestamptz, remaining int)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mi public.menu_items%ROWTYPE;
  _tz text;
  _duration int;
  _buffer int;
  _capacity int;
  _day date;
  _avail record;
  _slot_local timestamp;
  _window_end_local timestamp;
  _slot_start timestamptz;
  _slot_end timestamptz;
  _booked int;
BEGIN
  SELECT * INTO _mi FROM public.menu_items WHERE id = _menu_item_id;
  IF NOT FOUND OR NOT _mi.is_service THEN RETURN; END IF;
  IF _mi.is_available = false THEN RETURN; END IF;

  SELECT COALESCE(NULLIF(rs.timezone,''), 'Europe/Istanbul') INTO _tz
    FROM public.restaurant_settings rs WHERE rs.restaurant_id = _mi.restaurant_id LIMIT 1;
  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  _duration := COALESCE(_mi.service_duration_minutes, 60);
  _buffer := COALESCE(_mi.buffer_minutes, 0);
  _capacity := GREATEST(COALESCE(_mi.slot_capacity, 1), 1);

  _day := _from;
  WHILE _day <= _to LOOP
    FOR _avail IN
      SELECT start_time, end_time
        FROM public.service_availability
       WHERE menu_item_id = _menu_item_id
         AND is_active = true
         AND weekday = EXTRACT(DOW FROM _day)::smallint
    LOOP
      _slot_local := (_day::timestamp + _avail.start_time);
      _window_end_local := (_day::timestamp + _avail.end_time);
      WHILE _slot_local + make_interval(mins => _duration) <= _window_end_local LOOP
        _slot_start := (_slot_local AT TIME ZONE _tz);
        _slot_end := _slot_start + make_interval(mins => _duration);

        IF _slot_start > now() THEN
          SELECT count(*) INTO _booked
            FROM public.service_bookings
           WHERE menu_item_id = _menu_item_id
             AND start_at = _slot_start
             AND status IN ('booked','completed');

          start_at := _slot_start;
          end_at := _slot_end;
          remaining := GREATEST(_capacity - _booked, 0);
          IF remaining > 0 THEN RETURN NEXT; END IF;
        END IF;

        _slot_local := _slot_local + make_interval(mins => _duration + _buffer);
      END LOOP;
    END LOOP;
    _day := _day + 1;
  END LOOP;
END;
$$;

-- 5. Recreate create_public_order to accept slot_at per item
DROP FUNCTION IF EXISTS public.create_public_order(uuid, text, text, text, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.create_public_order(
  _restaurant_id uuid,
  _customer_name text,
  _customer_email text,
  _customer_phone text,
  _customer_location text,
  _payment_method text,
  _notes text,
  _items jsonb
)
RETURNS TABLE(id uuid, order_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  _slot_at timestamptz;
  _slot_end timestamptz;
  _booked int;
  _new_oi_id uuid;
BEGIN
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant not configured'; END IF;
  IF btrim(COALESCE(_customer_name,'')) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF btrim(COALESCE(_payment_method,'')) = '' THEN RAISE EXCEPTION 'Payment method is required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Please add items to the order'; END IF;

  SELECT status INTO _status FROM public.restaurants WHERE id = _restaurant_id;
  IF _status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.restaurant_settings rs WHERE rs.restaurant_id = _restaurant_id AND rs.allow_public_orders = true) THEN
    RAISE EXCEPTION 'Online ordering is currently unavailable for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id AND mi.is_available = true AND mi.is_public = true LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more menu items are unavailable'; END IF;
    IF _menu_item.is_service THEN
      IF (_item->>'slot_at') IS NULL THEN RAISE EXCEPTION 'Please choose a time slot for %', _menu_item.name; END IF;
      _quantity := 1; _extra_units := 0;
    END IF;
    IF _quantity = 0 AND _extra_units = 0 THEN RAISE EXCEPTION 'Each order item must include quantity or extra units'; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);
    _total := _total + _subtotal;
  END LOOP;

  _order_number := public.get_next_order_number(_restaurant_id);

  INSERT INTO public.orders (id, staff_id, total, payment_method, notes, customer_name, customer_email, customer_phone, customer_location, is_public_order, currency, restaurant_id, order_number, discount_amount, status)
  VALUES (_order_id, '00000000-0000-0000-0000-000000000000', _total, _payment_method, NULLIF(btrim(COALESCE(_notes,'')),''), btrim(_customer_name), NULLIF(btrim(COALESCE(_customer_email,'')),''), NULLIF(btrim(COALESCE(_customer_phone,'')),''), NULLIF(btrim(COALESCE(_customer_location,'')),''), true, 'TRY', _restaurant_id, _order_number, 0, 'pending');

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
    IF _menu_item.is_service THEN _quantity := 1; _extra_units := 0; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);

    INSERT INTO public.order_items (order_id, menu_item_id, menu_item_name, quantity, extra_units, base_price_at_time, per_unit_price_at_time, price_at_time, subtotal)
    VALUES (_order_id, _menu_item.id, _menu_item.name, _quantity, _extra_units, _menu_item.base_price, _menu_item.per_unit_price, _menu_item.base_price, _subtotal)
    RETURNING id INTO _new_oi_id;

    IF _menu_item.is_service THEN
      _slot_at := (_item->>'slot_at')::timestamptz;
      _slot_end := _slot_at + make_interval(mins => COALESCE(_menu_item.service_duration_minutes, 60));
      SELECT count(*) INTO _booked FROM public.service_bookings
        WHERE menu_item_id = _menu_item.id AND start_at = _slot_at AND status IN ('booked','completed');
      IF _booked >= GREATEST(COALESCE(_menu_item.slot_capacity,1),1) THEN
        RAISE EXCEPTION 'That slot for % is no longer available', _menu_item.name;
      END IF;
      INSERT INTO public.service_bookings (order_id, order_item_id, menu_item_id, restaurant_id, start_at, end_at, status, customer_name, customer_phone)
      VALUES (_order_id, _new_oi_id, _menu_item.id, _restaurant_id, _slot_at, _slot_end, 'booked', btrim(_customer_name), NULLIF(btrim(COALESCE(_customer_phone,'')),''));
    END IF;
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$$;

-- 6. Extend create_staff_order similarly
DROP FUNCTION IF EXISTS public.create_staff_order(uuid, text, text, numeric, text, jsonb, text);
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
SET search_path = public
AS $$
DECLARE
  _order_id uuid := gen_random_uuid();
  _order_number text;
  _subtotal_total numeric := 0;
  _item jsonb;
  _menu_item public.menu_items%ROWTYPE;
  _quantity int;
  _extra_units int;
  _subtotal numeric;
  _user_id uuid := auth.uid();
  _final_total numeric;
  _disc numeric := COALESCE(_discount_amount, 0);
  _ps text := COALESCE(NULLIF(btrim(_payment_status),''), 'paid');
  _status text;
  _slot_at timestamptz;
  _slot_end timestamptz;
  _booked int;
  _new_oi_id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant required'; END IF;
  IF btrim(COALESCE(_payment_method,'')) = '' THEN RAISE EXCEPTION 'Payment method required'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;
  IF _ps NOT IN ('paid','unpaid') THEN _ps := 'paid'; END IF;

  SELECT r.status INTO _status FROM public.restaurants r WHERE r.id = _restaurant_id;
  IF _status = 'on_hold' THEN RAISE EXCEPTION 'Restaurant is on hold. Please contact support.';
  ELSIF _status = 'archived' THEN RAISE EXCEPTION 'Restaurant is archived.';
  END IF;

  IF NOT (
    _restaurant_id = public.current_restaurant_id(_user_id)
    OR public.is_manager(_user_id, _restaurant_id)
    OR public.is_superadmin(_user_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this restaurant';
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found'; END IF;
    IF _menu_item.is_service THEN
      IF (_item->>'slot_at') IS NULL THEN RAISE EXCEPTION 'Please choose a time slot for %', _menu_item.name; END IF;
      _quantity := 1; _extra_units := 0;
    END IF;
    IF _quantity = 0 AND _extra_units = 0 THEN RAISE EXCEPTION 'Each item must have quantity or extra units'; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);
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
    NULLIF(btrim(COALESCE(_notes,'')),''), 'TRY', false,
    _restaurant_id, _order_number, _disc, 'confirmed',
    NULLIF(btrim(COALESCE(_customer_name,'')),''), _ps
  );

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _quantity := GREATEST(COALESCE((_item->>'quantity')::int, 0), 0);
    _extra_units := GREATEST(COALESCE((_item->>'extra_units')::int, 0), 0);
    SELECT mi.* INTO _menu_item FROM public.menu_items mi
      WHERE mi.id = (_item->>'menu_item_id')::uuid AND mi.restaurant_id = _restaurant_id LIMIT 1;
    IF _menu_item.is_service THEN _quantity := 1; _extra_units := 0; END IF;
    _subtotal := (_menu_item.base_price * _quantity) + (COALESCE(_menu_item.per_unit_price,0) * _extra_units);

    INSERT INTO public.order_items (
      order_id, menu_item_id, menu_item_name, quantity, extra_units,
      base_price_at_time, per_unit_price_at_time, price_at_time, subtotal
    ) VALUES (
      _order_id, _menu_item.id, _menu_item.name, _quantity, _extra_units,
      _menu_item.base_price, _menu_item.per_unit_price, _menu_item.base_price, _subtotal
    ) RETURNING id INTO _new_oi_id;

    IF _menu_item.is_service THEN
      _slot_at := (_item->>'slot_at')::timestamptz;
      _slot_end := _slot_at + make_interval(mins => COALESCE(_menu_item.service_duration_minutes, 60));
      SELECT count(*) INTO _booked FROM public.service_bookings
        WHERE menu_item_id = _menu_item.id AND start_at = _slot_at AND status IN ('booked','completed');
      IF _booked >= GREATEST(COALESCE(_menu_item.slot_capacity,1),1) THEN
        RAISE EXCEPTION 'That slot for % is no longer available', _menu_item.name;
      END IF;
      INSERT INTO public.service_bookings (order_id, order_item_id, menu_item_id, restaurant_id, start_at, end_at, status, customer_name)
      VALUES (_order_id, _new_oi_id, _menu_item.id, _restaurant_id, _slot_at, _slot_end, 'booked', NULLIF(btrim(COALESCE(_customer_name,'')),''));
    END IF;
  END LOOP;

  RETURN QUERY SELECT _order_id, _order_number;
END;
$$;

-- 7. Cancel booking RPC
CREATE OR REPLACE FUNCTION public.cancel_service_booking(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rid uuid;
BEGIN
  SELECT restaurant_id INTO _rid FROM public.service_bookings WHERE id = _booking_id;
  IF _rid IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT (_rid = public.current_restaurant_id(auth.uid()) OR public.is_manager(auth.uid(), _rid) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.service_bookings SET status = 'cancelled', updated_at = now() WHERE id = _booking_id;
END;
$$;