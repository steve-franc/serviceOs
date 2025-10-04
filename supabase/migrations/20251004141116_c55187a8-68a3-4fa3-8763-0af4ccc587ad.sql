-- Add staff_id to menu_items if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'menu_items' 
                 AND column_name = 'staff_id') THEN
    ALTER TABLE public.menu_items ADD COLUMN staff_id uuid REFERENCES auth.users(id);
    
    -- Update existing menu items to use the first available user
    UPDATE public.menu_items 
    SET staff_id = (SELECT id FROM auth.users LIMIT 1)
    WHERE staff_id IS NULL;
    
    -- Make it NOT NULL
    ALTER TABLE public.menu_items ALTER COLUMN staff_id SET NOT NULL;
  END IF;
END $$;

-- Drop all existing policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can view menu items" ON public.menu_items;
  DROP POLICY IF EXISTS "Authenticated users can create menu items" ON public.menu_items;
  DROP POLICY IF EXISTS "Authenticated users can update menu items" ON public.menu_items;
  DROP POLICY IF EXISTS "Authenticated users can delete menu items" ON public.menu_items;
  DROP POLICY IF EXISTS "Users can view own menu items" ON public.menu_items;
  DROP POLICY IF EXISTS "Users can create own menu items" ON public.menu_items;
  DROP POLICY IF EXISTS "Users can update own menu items" ON public.menu_items;
  DROP POLICY IF EXISTS "Users can delete own menu items" ON public.menu_items;
END $$;

-- Create new user-specific policies
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

-- Create daily_reports table
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

DROP POLICY IF EXISTS "Users can view own daily reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Users can create own daily reports" ON public.daily_reports;

CREATE POLICY "Users can view own daily reports" 
ON public.daily_reports FOR SELECT 
USING (auth.uid() = staff_id);

CREATE POLICY "Users can create own daily reports" 
ON public.daily_reports FOR INSERT 
WITH CHECK (auth.uid() = staff_id);