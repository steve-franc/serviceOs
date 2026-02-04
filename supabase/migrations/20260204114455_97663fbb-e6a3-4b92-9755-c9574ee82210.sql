-- Create function to get next available order number for a restaurant
CREATE OR REPLACE FUNCTION public.get_next_order_number(_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  -- Find the first gap in order numbers, or max + 1 if no gaps
  SELECT COALESCE(
    (
      SELECT MIN(o1.order_number + 1)
      FROM orders o1
      WHERE o1.restaurant_id = _restaurant_id
        AND NOT EXISTS (
          SELECT 1 FROM orders o2 
          WHERE o2.restaurant_id = _restaurant_id 
            AND o2.order_number = o1.order_number + 1
        )
    ),
    1
  ) INTO next_num;
  
  -- If no orders exist, start at 1
  IF NOT EXISTS (SELECT 1 FROM orders WHERE restaurant_id = _restaurant_id) THEN
    next_num := 1;
  END IF;
  
  RETURN next_num;
END;
$function$;

-- Create trigger function to set order number
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only set if not already provided or if using the sequence default
  IF NEW.order_number IS NULL OR NEW.order_number = 0 THEN
    NEW.order_number := public.get_next_order_number(NEW.restaurant_id);
  ELSE
    -- Even if a number was provided, recalculate to fill gaps
    NEW.order_number := public.get_next_order_number(NEW.restaurant_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Create trigger on orders table
DROP TRIGGER IF EXISTS set_order_number_trigger ON orders;
CREATE TRIGGER set_order_number_trigger
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_number();

-- Remove the default sequence from order_number (make it nullable temporarily handled by trigger)
ALTER TABLE orders ALTER COLUMN order_number DROP DEFAULT;