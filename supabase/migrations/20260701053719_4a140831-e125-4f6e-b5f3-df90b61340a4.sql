
CREATE OR REPLACE FUNCTION public.reset_auto_day_end(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tz text;
  _local_today date;
  _deleted int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_memberships
    WHERE user_id = auth.uid() AND restaurant_id = _restaurant_id
  ) THEN
    RETURN jsonb_build_object('error', 'not_a_member');
  END IF;

  SELECT COALESCE(NULLIF(rs.timezone, ''), 'Europe/Istanbul')
    INTO _tz
    FROM public.restaurant_settings rs
   WHERE rs.restaurant_id = _restaurant_id
   LIMIT 1;
  IF _tz IS NULL THEN _tz := 'Europe/Istanbul'; END IF;

  _local_today := ((now() AT TIME ZONE _tz))::date;

  DELETE FROM public.daily_reports
   WHERE restaurant_id = _restaurant_id
     AND report_date = _local_today;
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'reset_for_date', _local_today,
    'deleted_reports', _deleted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_auto_day_end(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_auto_day_end(uuid) TO authenticated;
