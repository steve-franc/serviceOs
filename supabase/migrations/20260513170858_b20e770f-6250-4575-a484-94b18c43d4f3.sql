CREATE OR REPLACE FUNCTION public.superadmin_platform_analytics(
  _days int DEFAULT 30,
  _business_types text[] DEFAULT NULL,
  _status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tz text := 'Europe/Istanbul';
  _today date := (now() AT TIME ZONE _tz)::date;
  _from date := _today - (_days - 1);
  _prev_from date := _from - _days;
  _prev_to date := _from - 1;
  _result jsonb;
  _trend jsonb;
  _industry jsonb;
  _top jsonb;
  _declining jsonb;
  _kpi jsonb;
  _service_stats jsonb;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  WITH filtered AS (
    SELECT r.id, r.name, r.business_type, r.status, r.created_at
    FROM public.restaurants r
    WHERE (_business_types IS NULL OR r.business_type = ANY(_business_types))
      AND (
        _status IS NULL
        OR (_status = 'active' AND EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.restaurant_id = r.id
                AND (o.created_at AT TIME ZONE _tz)::date >= _today - 30))
        OR (_status = 'inactive' AND NOT EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.restaurant_id = r.id
                AND (o.created_at AT TIME ZONE _tz)::date >= _today - 30))
      )
  ),
  k AS (
    SELECT
      (SELECT count(*) FROM filtered f
        WHERE EXISTS (SELECT 1 FROM public.orders o
                       WHERE o.restaurant_id = f.id
                         AND (o.created_at AT TIME ZONE _tz)::date >= _today - 30)
      ) AS active_businesses,
      (SELECT count(*) FROM filtered) AS total_businesses,
      (SELECT count(DISTINCT COALESCE(o.customer_phone, o.customer_email))
         FROM public.orders o
         JOIN filtered f ON f.id = o.restaurant_id
        WHERE COALESCE(o.customer_phone, o.customer_email) IS NOT NULL
      ) AS total_customers,
      (SELECT count(*) FROM public.orders o
         JOIN filtered f ON f.id = o.restaurant_id
        WHERE (o.created_at AT TIME ZONE _tz)::date >= _from
          AND (o.created_at AT TIME ZONE _tz)::date <= _today
      ) AS bookings_period,
      (SELECT count(*) FROM public.orders o
         JOIN filtered f ON f.id = o.restaurant_id
        WHERE (o.created_at AT TIME ZONE _tz)::date >= _prev_from
          AND (o.created_at AT TIME ZONE _tz)::date <= _prev_to
      ) AS bookings_prev_period,
      (SELECT count(DISTINCT COALESCE(o.customer_phone, o.customer_email))
         FROM public.orders o
         JOIN filtered f ON f.id = o.restaurant_id
        WHERE COALESCE(o.customer_phone, o.customer_email) IS NOT NULL
          AND (o.created_at AT TIME ZONE _tz)::date >= _from
      ) AS new_customers_period,
      (SELECT count(DISTINCT COALESCE(o.customer_phone, o.customer_email))
         FROM public.orders o
         JOIN filtered f ON f.id = o.restaurant_id
        WHERE COALESCE(o.customer_phone, o.customer_email) IS NOT NULL
          AND (o.created_at AT TIME ZONE _tz)::date >= _prev_from
          AND (o.created_at AT TIME ZONE _tz)::date <= _prev_to
      ) AS new_customers_prev
  )
  SELECT to_jsonb(k.*) INTO _kpi FROM k;

  WITH series AS (
    SELECT generate_series(_from, _today, '1 day'::interval)::date AS day
  ),
  daily AS (
    SELECT (o.created_at AT TIME ZONE _tz)::date AS day, count(*)::int AS bookings,
           count(DISTINCT COALESCE(o.customer_phone, o.customer_email))::int AS customers
      FROM public.orders o
     WHERE (o.created_at AT TIME ZONE _tz)::date >= _from
       AND (o.created_at AT TIME ZONE _tz)::date <= _today
       AND (_business_types IS NULL OR EXISTS (
             SELECT 1 FROM public.restaurants r
              WHERE r.id = o.restaurant_id AND r.business_type = ANY(_business_types)))
     GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'day', s.day,
    'bookings', COALESCE(d.bookings, 0),
    'customers', COALESCE(d.customers, 0)
  ) ORDER BY s.day)
  INTO _trend
  FROM series s LEFT JOIN daily d USING (day);

  SELECT jsonb_agg(jsonb_build_object('business_type', bt, 'bookings', cnt) ORDER BY cnt DESC)
  INTO _industry
  FROM (
    SELECT COALESCE(r.business_type, 'unknown') AS bt, count(*)::int AS cnt
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
     WHERE (o.created_at AT TIME ZONE _tz)::date >= _from
       AND (_business_types IS NULL OR r.business_type = ANY(_business_types))
     GROUP BY 1
  ) x;

  SELECT jsonb_agg(t ORDER BY t.bookings_period DESC)
  INTO _top
  FROM (
    SELECT r.id, r.name, r.business_type, r.status,
           count(o.id) FILTER (
             WHERE (o.created_at AT TIME ZONE _tz)::date >= _from
           )::int AS bookings_period,
           count(o.id) FILTER (
             WHERE (o.created_at AT TIME ZONE _tz)::date >= _prev_from
               AND (o.created_at AT TIME ZONE _tz)::date <= _prev_to
           )::int AS bookings_prev,
           max(o.created_at) AS last_activity
      FROM public.restaurants r
      LEFT JOIN public.orders o ON o.restaurant_id = r.id
     WHERE (_business_types IS NULL OR r.business_type = ANY(_business_types))
     GROUP BY r.id
     ORDER BY bookings_period DESC
     LIMIT 25
  ) t;

  SELECT jsonb_agg(d ORDER BY d.pct_change ASC)
  INTO _declining
  FROM (
    SELECT r.id, r.name, r.business_type,
           count(o.id) FILTER (
             WHERE (o.created_at AT TIME ZONE _tz)::date >= _from
           )::int AS bookings_period,
           count(o.id) FILTER (
             WHERE (o.created_at AT TIME ZONE _tz)::date >= _prev_from
               AND (o.created_at AT TIME ZONE _tz)::date <= _prev_to
           )::int AS bookings_prev,
           max(o.created_at) AS last_activity,
           CASE
             WHEN count(o.id) FILTER (
                    WHERE (o.created_at AT TIME ZONE _tz)::date >= _prev_from
                      AND (o.created_at AT TIME ZONE _tz)::date <= _prev_to
                  ) > 0
             THEN ((count(o.id) FILTER (
                      WHERE (o.created_at AT TIME ZONE _tz)::date >= _from
                    )::numeric
                   - count(o.id) FILTER (
                      WHERE (o.created_at AT TIME ZONE _tz)::date >= _prev_from
                        AND (o.created_at AT TIME ZONE _tz)::date <= _prev_to
                    )::numeric)
                  / count(o.id) FILTER (
                      WHERE (o.created_at AT TIME ZONE _tz)::date >= _prev_from
                        AND (o.created_at AT TIME ZONE _tz)::date <= _prev_to
                    )::numeric * 100)
             ELSE NULL
           END AS pct_change
      FROM public.restaurants r
      LEFT JOIN public.orders o ON o.restaurant_id = r.id
     WHERE (_business_types IS NULL OR r.business_type = ANY(_business_types))
     GROUP BY r.id
  ) d
  WHERE d.bookings_prev >= 5 AND d.pct_change IS NOT NULL AND d.pct_change <= -20;

  SELECT jsonb_build_object(
    'total', count(*),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'no_show', count(*) FILTER (WHERE status = 'no_show'),
    'completed', count(*) FILTER (WHERE status IN ('completed','booked'))
  )
  INTO _service_stats
  FROM public.service_bookings sb
  WHERE (sb.created_at AT TIME ZONE _tz)::date >= _from;

  _result := jsonb_build_object(
    'period', jsonb_build_object('days', _days, 'from', _from, 'to', _today),
    'kpi', _kpi,
    'trend', COALESCE(_trend, '[]'::jsonb),
    'industry', COALESCE(_industry, '[]'::jsonb),
    'top_businesses', COALESCE(_top, '[]'::jsonb),
    'declining', COALESCE(_declining, '[]'::jsonb),
    'service_stats', COALESCE(_service_stats, '{}'::jsonb)
  );

  RETURN _result;
END $$;

REVOKE ALL ON FUNCTION public.superadmin_platform_analytics(int, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_platform_analytics(int, text[], text) TO authenticated;