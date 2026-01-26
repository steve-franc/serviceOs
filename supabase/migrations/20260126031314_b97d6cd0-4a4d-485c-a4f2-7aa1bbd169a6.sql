-- Create a trigger function to automatically assign manager role when a restaurant is created
CREATE OR REPLACE FUNCTION public.handle_new_restaurant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only proceed if created_by is set
  IF NEW.created_by IS NOT NULL THEN
    -- Create restaurant membership for the creator
    INSERT INTO public.restaurant_memberships (user_id, restaurant_id)
    VALUES (NEW.created_by, NEW.id)
    ON CONFLICT DO NOTHING;
    
    -- Assign manager role to the creator
    INSERT INTO public.user_roles (user_id, role, restaurant_id)
    VALUES (NEW.created_by, 'manager', NEW.id)
    ON CONFLICT (user_id, role, restaurant_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on restaurants table
DROP TRIGGER IF EXISTS on_restaurant_created ON public.restaurants;
CREATE TRIGGER on_restaurant_created
  AFTER INSERT ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_restaurant();

-- Also add RLS policy to allow anyone to create a restaurant
CREATE POLICY "Authenticated users can create restaurants"
  ON public.restaurants
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);