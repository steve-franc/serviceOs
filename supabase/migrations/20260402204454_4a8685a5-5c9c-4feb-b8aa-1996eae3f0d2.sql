CREATE OR REPLACE FUNCTION public.get_next_order_number(_restaurant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(order_number), 0) + 1
  INTO next_num
  FROM orders
  WHERE restaurant_id = _restaurant_id;

  RETURN next_num;
END;
$function$;