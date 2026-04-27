-- 1) Add timezone to restaurant_settings
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Istanbul';

-- 2) Server-side close-day function (security definer)
CREATE OR REPLACE FUNCTION public.close_day_for_restaurant(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _tz text;
  _local_today date;
  _last_cutoff timestamptz;
  _staff uuid;
  _total_orders int := 0;
  _total_revenue numeric := 0;
  _pm jsonb := '{}'::jsonb;
  _row record;
BEGIN
  -- Resolve restaurant timezone (fallback Europe/Istanbul)
  SELECT COALESCE(NULLIF(rs.timezone, ''), 'Europe/Istanbul')
    INTO _tz
    FROM public.restaurant_settings rs
   WHERE rs.restaurant_id = _restaurant_id
   LIMIT 1;
  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  -- Local "today" for the restaurant
  _local_today := (now() AT TIME ZONE _tz)::date;

  -- Skip if a report already exists for today's local date
  IF EXISTS (
    SELECT 1 FROM public.daily_reports
     WHERE restaurant_id = _restaurant_id
       AND report_date = _local_today
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_closed', 'date', _local_today);
  END IF;

  -- Cutoff = created_at of last report (or epoch)
  SELECT COALESCE(MAX(created_at), 'epoch'::timestamptz)
    INTO _last_cutoff
    FROM public.daily_reports
   WHERE restaurant_id = _restaurant_id;

  -- Pick a staff_id to attribute the report to (restaurant creator preferred,
  -- otherwise any manager, otherwise any member). Required by NOT NULL column.
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

  -- Aggregate paid + confirmed orders since last cutoff
  FOR _row IN
    SELECT total, payment_method
      FROM public.orders
     WHERE restaurant_id = _restaurant_id
       AND status = 'confirmed'
       AND COALESCE(payment_status, 'paid') = 'paid'
       AND created_at > _last_cutoff
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
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_orders', 'date', _local_today);
  END IF;

  INSERT INTO public.daily_reports (
    staff_id, restaurant_id, report_date, total_orders, total_revenue, payment_methods
  ) VALUES (
    _staff, _restaurant_id, _local_today, _total_orders, _total_revenue, _pm
  );

  RETURN jsonb_build_object(
    'closed', true,
    'date', _local_today,
    'total_orders', _total_orders,
    'total_revenue', _total_revenue
  );
END;
$function$;

-- 3) Enable extensions needed for cron-driven HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;