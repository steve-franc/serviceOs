
CREATE OR REPLACE FUNCTION public.superadmin_list_orders(_limit int DEFAULT 200)
RETURNS TABLE(
  id uuid, order_number text, total numeric, payment_method text,
  status text, payment_status text, created_at timestamptz,
  customer_name text, is_public_order boolean,
  restaurant_id uuid, restaurant_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT o.id, o.order_number, o.total, o.payment_method,
         o.status, o.payment_status, o.created_at,
         o.customer_name, o.is_public_order,
         o.restaurant_id, r.name
  FROM public.orders o
  LEFT JOIN public.restaurants r ON r.id = o.restaurant_id
  ORDER BY o.created_at DESC
  LIMIT GREATEST(_limit, 1);
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_daily_trend(_days int DEFAULT 30)
RETURNS TABLE(day date, total_orders int, total_revenue numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  WITH series AS (
    SELECT generate_series(
      ((now() AT TIME ZONE 'Europe/Istanbul')::date - (_days - 1)),
      ((now() AT TIME ZONE 'Europe/Istanbul')::date),
      interval '1 day'
    )::date AS d
  ),
  agg AS (
    SELECT (created_at AT TIME ZONE 'Europe/Istanbul')::date AS d,
           count(*)::int AS c, COALESCE(sum(total),0) AS rev
    FROM public.orders
    WHERE status='confirmed' AND COALESCE(payment_status,'paid')='paid'
      AND (created_at AT TIME ZONE 'Europe/Istanbul')::date >= ((now() AT TIME ZONE 'Europe/Istanbul')::date - (_days - 1))
    GROUP BY 1
  )
  SELECT s.d, COALESCE(a.c, 0), COALESCE(a.rev, 0)::numeric
  FROM series s LEFT JOIN agg a USING (d)
  ORDER BY s.d;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_top_products(_limit int DEFAULT 20)
RETURNS TABLE(menu_item_name text, total_sold int, revenue numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT oi.menu_item_name,
         sum(oi.quantity + oi.extra_units)::int,
         sum(oi.subtotal)::numeric
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.status='confirmed' AND COALESCE(o.payment_status,'paid')='paid'
  GROUP BY oi.menu_item_name
  ORDER BY 3 DESC
  LIMIT GREATEST(_limit, 1);
END $$;
