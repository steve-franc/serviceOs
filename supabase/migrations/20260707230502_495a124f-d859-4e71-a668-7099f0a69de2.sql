CREATE OR REPLACE FUNCTION public.close_missing_days_for_restaurant(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tz text;
  _enabled boolean;
  _staff uuid;
  _first_order_date date;
  _last_date_to_close date;
  _day date;
  _day_start timestamptz;
  _day_end timestamptz;
  _total_orders int;
  _total_revenue numeric;
  _pm jsonb;
  _closed_count int := 0;
  _skipped_count int := 0;
  _reports jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(NULLIF(rs.timezone, ''), 'Europe/Istanbul'), COALESCE(rs.auto_end_of_day_enabled, true)
    INTO _tz, _enabled
    FROM public.restaurant_settings rs
   WHERE rs.restaurant_id = _restaurant_id
   LIMIT 1;

  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  IF _enabled IS FALSE THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'auto_end_of_day_disabled');
  END IF;

  SELECT r.created_by
    INTO _staff
    FROM public.restaurants r
    JOIN auth.users au ON au.id = r.created_by
   WHERE r.id = _restaurant_id
   LIMIT 1;

  IF _staff IS NULL THEN
    SELECT ur.user_id
      INTO _staff
      FROM public.user_roles ur
      JOIN auth.users au ON au.id = ur.user_id
     WHERE ur.restaurant_id = _restaurant_id
       AND ur.role = 'manager'
     ORDER BY ur.created_at NULLS LAST
     LIMIT 1;
  END IF;

  IF _staff IS NULL THEN
    SELECT rm.user_id
      INTO _staff
      FROM public.restaurant_memberships rm
      JOIN auth.users au ON au.id = rm.user_id
     WHERE rm.restaurant_id = _restaurant_id
     LIMIT 1;
  END IF;

  IF _staff IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_valid_staff');
  END IF;

  SELECT MIN((o.created_at AT TIME ZONE _tz)::date)
    INTO _first_order_date
    FROM public.orders o
   WHERE o.restaurant_id = _restaurant_id
     AND o.status = 'confirmed'
     AND COALESCE(o.payment_status, 'paid') = 'paid';

  IF _first_order_date IS NULL THEN
    RETURN jsonb_build_object('closed_days', 0, 'skipped_days', 0, 'reason', 'no_orders');
  END IF;

  -- Close through today only if local time has reached/passed 23:59.
  -- Otherwise, catch up through yesterday so today's active trade stays open.
  IF (now() AT TIME ZONE _tz)::time >= time '23:59' THEN
    _last_date_to_close := (now() AT TIME ZONE _tz)::date;
  ELSE
    _last_date_to_close := ((now() AT TIME ZONE _tz)::date - 1);
  END IF;

  IF _last_date_to_close < _first_order_date THEN
    RETURN jsonb_build_object('closed_days', 0, 'skipped_days', 0, 'reason', 'nothing_due');
  END IF;

  FOR _day IN SELECT generate_series(_first_order_date, _last_date_to_close, interval '1 day')::date LOOP
    IF EXISTS (
      SELECT 1 FROM public.daily_reports
       WHERE restaurant_id = _restaurant_id
         AND report_date = _day
    ) THEN
      _skipped_count := _skipped_count + 1;
      CONTINUE;
    END IF;

    _day_start := (_day::timestamp AT TIME ZONE _tz);
    _day_end := ((_day + 1)::timestamp AT TIME ZONE _tz);

    SELECT COUNT(*)::int, COALESCE(SUM(o.total), 0)
      INTO _total_orders, _total_revenue
      FROM public.orders o
     WHERE o.restaurant_id = _restaurant_id
       AND o.status = 'confirmed'
       AND COALESCE(o.payment_status, 'paid') = 'paid'
       AND o.created_at >= _day_start
       AND o.created_at < _day_end;

    IF _total_orders = 0 THEN
      _skipped_count := _skipped_count + 1;
      CONTINUE;
    END IF;

    SELECT COALESCE(
      jsonb_object_agg(payment_key, jsonb_build_object('count', order_count, 'total', order_total)),
      '{}'::jsonb
    )
      INTO _pm
      FROM (
        SELECT COALESCE(NULLIF(o.payment_method, ''), 'unknown') AS payment_key,
               COUNT(*)::int AS order_count,
               COALESCE(SUM(o.total), 0) AS order_total
          FROM public.orders o
         WHERE o.restaurant_id = _restaurant_id
           AND o.status = 'confirmed'
           AND COALESCE(o.payment_status, 'paid') = 'paid'
           AND o.created_at >= _day_start
           AND o.created_at < _day_end
         GROUP BY 1
      ) grouped_methods;

    INSERT INTO public.daily_reports (
      staff_id, restaurant_id, report_date, total_orders, total_revenue, payment_methods
    ) VALUES (
      _staff, _restaurant_id, _day, _total_orders, _total_revenue, _pm
    );

    _closed_count := _closed_count + 1;
    _reports := _reports || jsonb_build_array(jsonb_build_object(
      'date', _day,
      'total_orders', _total_orders,
      'total_revenue', _total_revenue
    ));
  END LOOP;

  UPDATE public.restaurant_settings
     SET auto_end_of_day_enabled = true,
         next_scheduled_end_at = (((now() AT TIME ZONE _tz)::date + time '23:59') AT TIME ZONE _tz)
   WHERE restaurant_id = _restaurant_id;

  RETURN jsonb_build_object(
    'closed_days', _closed_count,
    'skipped_days', _skipped_count,
    'reports', _reports,
    'next_close', (((now() AT TIME ZONE _tz)::date + time '23:59') AT TIME ZONE _tz)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_day_for_restaurant(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.close_missing_days_for_restaurant(_restaurant_id);
END;
$function$;