-- Create menu item variations table
CREATE TABLE public.menu_item_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_adjustment NUMERIC NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT unique_variation_name_per_item UNIQUE (menu_item_id, name)
);

-- Enable RLS
ALTER TABLE public.menu_item_variations ENABLE ROW LEVEL SECURITY;

-- Policies: follow menu_items pattern
CREATE POLICY "Restaurant members can view variations"
ON public.menu_item_variations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_variations.menu_item_id
    AND (
      (auth.uid() IS NOT NULL AND (mi.restaurant_id = current_restaurant_id(auth.uid()) OR is_manager(auth.uid(), mi.restaurant_id)))
      OR (auth.uid() IS NULL AND mi.is_available = true)
    )
  )
);

CREATE POLICY "Managers can create variations"
ON public.menu_item_variations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_variations.menu_item_id
    AND is_manager(auth.uid(), mi.restaurant_id)
  )
);

CREATE POLICY "Managers can update variations"
ON public.menu_item_variations
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_variations.menu_item_id
    AND is_manager(auth.uid(), mi.restaurant_id)
  )
);

CREATE POLICY "Managers can delete variations"
ON public.menu_item_variations
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.menu_items mi
    WHERE mi.id = menu_item_variations.menu_item_id
    AND is_manager(auth.uid(), mi.restaurant_id)
  )
);