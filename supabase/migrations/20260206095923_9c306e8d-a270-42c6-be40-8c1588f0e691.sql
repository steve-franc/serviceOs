-- Drop the menu_item_variations table and all its policies
DROP TABLE IF EXISTS public.menu_item_variations CASCADE;

-- Create daily_expenses table for quick-add expenses during the day
CREATE TABLE public.daily_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_expenses ENABLE ROW LEVEL SECURITY;

-- Restaurant members can view expenses for their restaurant
CREATE POLICY "Restaurant members can view expenses"
ON public.daily_expenses
FOR SELECT
USING (
  (auth.uid() IS NOT NULL) AND 
  ((restaurant_id = current_restaurant_id(auth.uid())) OR is_manager(auth.uid(), restaurant_id))
);

-- Restaurant members can create expenses for their restaurant
CREATE POLICY "Restaurant members can create expenses"
ON public.daily_expenses
FOR INSERT
WITH CHECK (
  (auth.uid() = staff_id) AND 
  (restaurant_id = current_restaurant_id(auth.uid()))
);

-- Staff can delete their own expenses, managers can delete any
CREATE POLICY "Staff can delete own expenses"
ON public.daily_expenses
FOR DELETE
USING (
  ((auth.uid() = staff_id) AND (restaurant_id = current_restaurant_id(auth.uid()))) 
  OR is_manager(auth.uid(), restaurant_id)
);