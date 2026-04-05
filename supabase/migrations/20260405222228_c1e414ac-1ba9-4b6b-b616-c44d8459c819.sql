
-- Create menu_tags table for predefined tags per restaurant
CREATE TABLE public.menu_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, name)
);

ALTER TABLE public.menu_tags ENABLE ROW LEVEL SECURITY;

-- Everyone in the restaurant can view tags
CREATE POLICY "Restaurant members can view tags"
ON public.menu_tags FOR SELECT
TO public
USING (
  (auth.uid() IS NOT NULL AND (restaurant_id = current_restaurant_id(auth.uid()) OR is_manager(auth.uid(), restaurant_id)))
);

-- Managers can create tags
CREATE POLICY "Managers can create tags"
ON public.menu_tags FOR INSERT
TO public
WITH CHECK (is_manager(auth.uid(), restaurant_id));

-- Managers can delete tags
CREATE POLICY "Managers can delete tags"
ON public.menu_tags FOR DELETE
TO public
USING (is_manager(auth.uid(), restaurant_id));

-- Add tags column to menu_items as text array
ALTER TABLE public.menu_items ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
