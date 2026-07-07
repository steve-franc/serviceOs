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
  _enabled boolean;
BEGIN
  SELECT
    COALESCE(NULLIF(rs.timezone, ''), 'Europe/Istanbul'),
    COALESCE(rs.auto_end_of_day_enabled, true)
    INTO _tz, _enabled
    FROM public.restaurant_settings rs
   WHERE rs.restaurant_id = _restaurant_id
   LIMIT 1;

  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  IF _enabled IS FALSE THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'auto_end_of_day_disabled');
  END IF;

  _local_now := (now() AT TIME ZONE _tz);

  IF extract(hour from _local_now) = 23 THEN
    _report_date := _local_now::date;
  ELSIF extract(hour from _local_now) = 0 THEN
    _report_date := (_local_now - interval '1 day')::date;
  ELSE
    _report_date := _local_now::date;
  END IF;

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

  -- Pick a real auth user only. Some legacy restaurants have created_by values
  -- that no longer exist in auth.users; using those breaks the report insert.
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
      ARRAY[COALESCE(NULLIF(_row.payment_method, ''), 'unknown')],
      jsonb_build_object(
        'count', COALESCE((_pm -> COALESCE(NULLIF(_row.payment_method, ''), 'unknown') ->> 'count')::int, 0) + 1,
        'total', COALESCE((_pm -> COALESCE(NULLIF(_row.payment_method, ''), 'unknown') ->> 'total')::numeric, 0) + COALESCE(_row.total, 0)
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

  UPDATE public.restaurant_settings
     SET auto_end_of_day_enabled = true,
         next_scheduled_end_at = (((_report_date + interval '1 day')::date + time '23:59')::timestamp AT TIME ZONE _tz)
   WHERE restaurant_id = _restaurant_id;

  RETURN jsonb_build_object(
    'closed', true,
    'date', _report_date,
    'staff_id', _staff,
    'total_orders', _total_orders,
    'total_revenue', _total_revenue
  );
END;
$function$;

UPDATE public.restaurant_settings
   SET auto_end_of_day_enabled = true,
       next_scheduled_end_at = (((now() AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'Europe/Istanbul'))::date + time '23:59') AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'Europe/Istanbul'))
 WHERE COALESCE(auto_end_of_day_enabled, true) = true;