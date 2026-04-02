CREATE OR REPLACE FUNCTION public.get_next_order_number(_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(
    (
      SELECT MIN(o1.order_number + 1)
      FROM public.orders o1
      WHERE o1.restaurant_id = _restaurant_id
        AND o1.order_number >= 1
        AND NOT EXISTS (
          SELECT 1
          FROM public.orders o2
          WHERE o2.restaurant_id = _restaurant_id
            AND o2.order_number = o1.order_number + 1
        )
    ),
    1
  )
  INTO next_num;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orders
    WHERE restaurant_id = _restaurant_id
      AND order_number >= 1
  ) THEN
    next_num := 1;
  END IF;

  RETURN next_num;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.order_number := public.get_next_order_number(NEW.restaurant_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_order_number_trigger ON public.orders;
CREATE TRIGGER set_order_number_trigger
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();