DROP FUNCTION IF EXISTS public.superadmin_list_restaurants();

CREATE OR REPLACE FUNCTION public.superadmin_list_restaurants()
 RETURNS TABLE(id uuid, name text, status text, created_at timestamp with time zone, created_by uuid, staff_count integer, orders_count integer, revenue numeric, last_order_at timestamp with time zone, logo_url text, business_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT
    r.id, r.name, r.status, r.created_at, r.created_by,
    COALESCE((SELECT count(*)::int FROM public.restaurant_memberships m WHERE m.restaurant_id = r.id), 0),
    COALESCE((SELECT count(*)::int FROM public.orders o WHERE o.restaurant_id = r.id), 0),
    COALESCE((SELECT sum(o.total) FROM public.orders o WHERE o.restaurant_id = r.id AND o.status='confirmed' AND COALESCE(o.payment_status,'paid')='paid'), 0)::numeric,
    (SELECT max(o.created_at) FROM public.orders o WHERE o.restaurant_id = r.id),
    (SELECT rs.logo_url FROM public.restaurant_settings rs WHERE rs.restaurant_id = r.id LIMIT 1),
    COALESCE(r.business_type, 'restaurant')
  FROM public.restaurants r
  ORDER BY r.created_at DESC;
END $function$;