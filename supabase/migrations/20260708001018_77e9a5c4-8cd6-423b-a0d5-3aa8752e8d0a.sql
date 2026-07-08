
CREATE OR REPLACE FUNCTION public.correct_daily_report_dates()
RETURNS TABLE(report_id uuid, old_report_date date, new_report_date date, order_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _report RECORD;
  _new_date date;
  _order_count int;
  _tz text;
BEGIN
  FOR _report IN
    SELECT id, restaurant_id, report_date
    FROM public.daily_reports
    ORDER BY created_at
  LOOP
    SELECT COALESCE(NULLIF(rs.timezone, ''), 'UTC')
      INTO _tz
    FROM public.restaurant_settings rs
    WHERE rs.restaurant_id = _report.restaurant_id
    LIMIT 1;
    IF _tz IS NULL THEN _tz := 'UTC'; END IF;

    SELECT DATE(MIN(o.created_at)), COUNT(*)
      INTO _new_date, _order_count
    FROM public.orders o
    WHERE o.restaurant_id = _report.restaurant_id
      AND DATE(o.created_at AT TIME ZONE _tz) = _report.report_date;

    IF _new_date IS NOT NULL AND _new_date <> _report.report_date THEN
      -- Avoid violating the (restaurant_id, report_date) uniqueness if one exists
      IF NOT EXISTS (
        SELECT 1 FROM public.daily_reports dr2
        WHERE dr2.restaurant_id = _report.restaurant_id
          AND dr2.report_date = _new_date
          AND dr2.id <> _report.id
      ) THEN
        UPDATE public.daily_reports
           SET report_date = _new_date
         WHERE id = _report.id;

        report_id := _report.id;
        old_report_date := _report.report_date;
        new_report_date := _new_date;
        order_count := _order_count;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_daily_report_dates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_daily_report_dates() TO service_role;
