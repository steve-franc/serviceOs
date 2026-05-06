CREATE OR REPLACE FUNCTION public.close_day_for_restaurant(_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tz text;
  _local_now timestamp;
  _report_date date;
  _boundary_utc timestamptz;
  _last_cutoff timestamptz;
  _staff uuid;
  _total_orders int := 0;
  _total_revenue numeric := 0;
  _pm jsonb := '{}'::jsonb;
  _row record;
BEGIN
  SELECT COALESCE(NULLIF(rs.timezone, ''), 'Europe/Istanbul')
    INTO _tz
    FROM public.restaurant_settings rs
   WHERE rs.restaurant_id = _restaurant_id
   LIMIT 1;
  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  -- Local "now" for the restaurant
  _local_now := (now() AT TIME ZONE _tz);

  -- Determine which day this close belongs to:
  --   - If we're at hour 23 (the 23:59 fire), close TODAY.
  --   - If we're at hour 0 (00:00..00:09 catchup), close YESTERDAY.
  --   - Otherwise (manual/force trigger), close yesterday if we're past midnight,
  --     else close today (treat as same-day close for current local date).
  IF extract(hour from _local_now) = 23 THEN
    _report_date := _local_now::date;
  ELSIF extract(hour from _local_now) = 0 THEN
    _report_date := (_local_now - interval '1 day')::date;
  ELSE
    _report_date := _local_now::date;
  END IF;

  -- Hard upper bound for "today's" orders = local midnight of the next day.
  -- Anything created at/after this boundary belongs to the next day's report.
  _boundary_utc := ((_report_date + interval '1 day')::timestamp AT TIME ZONE _tz);

  IF EXISTS (
    SELECT 1 FROM public.daily_reports
     WHERE restaurant_id = _restaurant_id
       AND report_date = _report_date
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_closed', 'date', _report_date);
  END IF;

  SELECT COALESCE(MAX(created_at), 'epoch'::timestamptz)
    INTO _last_cutoff
    FROM public.daily_reports
   WHERE restaurant_id = _restaurant_id;

  SELECT created_by INTO _staff FROM public.restaurants WHERE id = _restaurant_id;
  IF _staff IS NULL THEN
    SELECT user_id INTO _staff FROM public.user_roles
      WHERE restaurant_id = _restaurant_id AND role = 'manager' LIMIT 1;
  END IF;
  IF _staff IS NULL THEN
    SELECT user_id INTO _staff FROM public.restaurant_memberships
      WHERE restaurant_id = _restaurant_id LIMIT 1;
  END IF;
  IF _staff IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_staff');
  END IF;

  FOR _row IN
    SELECT total, payment_method
      FROM public.orders
     WHERE restaurant_id = _restaurant_id
       AND status = 'confirmed'
       AND COALESCE(payment_status, 'paid') = 'paid'
       AND created_at > _last_cutoff
       AND created_at < _boundary_utc
  LOOP
    _total_orders := _total_orders + 1;
    _total_revenue := _total_revenue + COALESCE(_row.total, 0);
    _pm := jsonb_set(
      _pm,
      ARRAY[_row.payment_method],
      jsonb_build_object(
        'count', COALESCE((_pm -> _row.payment_method ->> 'count')::int, 0) + 1,
        'total', COALESCE((_pm -> _row.payment_method ->> 'total')::numeric, 0) + COALESCE(_row.total, 0)
      ),
      true
    );
  END LOOP;

  IF _total_orders = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_orders', 'date', _report_date);
  END IF;

  INSERT INTO public.daily_reports (
    staff_id, restaurant_id, report_date, total_orders, total_revenue, payment_methods
  ) VALUES (
    _staff, _restaurant_id, _report_date, _total_orders, _total_revenue, _pm
  );

  RETURN jsonb_build_object(
    'closed', true,
    'date', _report_date,
    'total_orders', _total_orders,
    'total_revenue', _total_revenue
  );
END;
$function$;