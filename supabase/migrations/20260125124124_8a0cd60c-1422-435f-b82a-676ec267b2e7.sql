-- Create inventory status enum
CREATE TYPE public.inventory_status AS ENUM ('available', 'almost_finished', 'finished');

-- Create inventory table
CREATE TABLE public.inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  quantity numeric DEFAULT 0,
  unit text DEFAULT 'units',
  status inventory_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Restaurant members can view inventory
CREATE POLICY "Restaurant members can view inventory"
  ON public.inventory FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      restaurant_id = current_restaurant_id(auth.uid())
      OR is_manager(auth.uid(), restaurant_id)
    )
  );

-- Managers can create inventory items
CREATE POLICY "Managers can create inventory items"
  ON public.inventory FOR INSERT
  WITH CHECK (
    is_manager(auth.uid(), restaurant_id)
    AND restaurant_id = current_restaurant_id(auth.uid())
  );

-- Managers can update inventory items
CREATE POLICY "Managers can update inventory items"
  ON public.inventory FOR UPDATE
  USING (
    is_manager(auth.uid(), restaurant_id)
    AND restaurant_id = current_restaurant_id(auth.uid())
  );

-- Managers can delete inventory items
CREATE POLICY "Managers can delete inventory items"
  ON public.inventory FOR DELETE
  USING (
    is_manager(auth.uid(), restaurant_id)
    AND restaurant_id = current_restaurant_id(auth.uid())
  );

-- Trigger for inventory updated_at
CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();