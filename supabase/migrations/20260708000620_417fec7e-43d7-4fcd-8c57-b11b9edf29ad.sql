
CREATE OR REPLACE FUNCTION public.get_orders_for_report(_report_id uuid)
RETURNS SETOF public.orders
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _restaurant_id uuid;
  _report_date date;
  _tz text;
  _day_start timestamptz;
  _day_end timestamptz;
BEGIN
  SELECT dr.restaurant_id, dr.report_date
    INTO _restaurant_id, _report_date
  FROM public.daily_reports dr
  WHERE dr.id = _report_id;

  IF _restaurant_id IS NULL THEN
    RETURN;
  END IF;

  -- Access control: caller must belong to the restaurant (or be service role).
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_memberships rm
    WHERE rm.restaurant_id = _restaurant_id
      AND rm.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(rs.timezone, ''), 'Europe/Istanbul')
    INTO _tz
  FROM public.restaurant_settings rs
  WHERE rs.restaurant_id = _restaurant_id
  LIMIT 1;

  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  _day_start := (_report_date::timestamp AT TIME ZONE _tz);
  _day_end   := ((_report_date + 1)::timestamp AT TIME ZONE _tz);

  RETURN QUERY
  SELECT o.*
  FROM public.orders o
  WHERE o.restaurant_id = _restaurant_id
    AND (
      -- Paid orders: bucket by when they were paid (falls back to created_at)
      (COALESCE(o.payment_status, 'paid') = 'paid'
        AND COALESCE(o.paid_at, o.created_at) >= _day_start
        AND COALESCE(o.paid_at, o.created_at) <  _day_end)
      OR
      -- Unpaid/other: bucket by creation time
      (COALESCE(o.payment_status, 'paid') <> 'paid'
        AND o.created_at >= _day_start
        AND o.created_at <  _day_end)
    )
  ORDER BY o.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_orders_for_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_for_report(uuid) TO authenticated, service_role;
