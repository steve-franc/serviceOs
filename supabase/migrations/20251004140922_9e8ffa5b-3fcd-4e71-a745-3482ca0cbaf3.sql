-- Add staff_id to menu_items as nullable first
ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES auth.users(id);

-- Update existing menu items to use the first available user
-- In production, you'd want to assign these properly
UPDATE public.menu_items 
SET staff_id = (SELECT id FROM auth.users LIMIT 1)
WHERE staff_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE public.menu_items 
ALTER COLUMN staff_id SET NOT NULL;

-- Update RLS policies for menu_items to be user-specific
DROP POLICY IF EXISTS "Authenticated users can view menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Authenticated users can create menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Authenticated users can update menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Authenticated users can delete menu items" ON public.menu_items;

CREATE POLICY "Users can view own menu items" 
ON public.menu_items FOR SELECT 
USING (auth.uid() = staff_id);

CREATE POLICY "Users can create own menu items" 
ON public.menu_items FOR INSERT 
WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Users can update own menu items" 
ON public.menu_items FOR UPDATE 
USING (auth.uid() = staff_id);

CREATE POLICY "Users can delete own menu items" 
ON public.menu_items FOR DELETE 
USING (auth.uid() = staff_id);

-- Create daily_reports table for end-of-day summaries
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES auth.users(id) NOT NULL,
  report_date date NOT NULL,
  total_orders integer NOT NULL,
  total_revenue numeric NOT NULL,
  payment_methods jsonb,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(staff_id, report_date)
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily reports" 
ON public.daily_reports FOR SELECT 
USING (auth.uid() = staff_id);

CREATE POLICY "Users can create own daily reports" 
ON public.daily_reports FOR INSERT 
WITH CHECK (auth.uid() = staff_id);