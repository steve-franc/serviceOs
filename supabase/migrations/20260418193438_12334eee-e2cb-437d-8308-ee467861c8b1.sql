-- Helper: is_investor (security definer)
CREATE OR REPLACE FUNCTION public.is_investor(_user_id uuid, _restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'investor'::app_role, _restaurant_id)
$$;

-- Add SELECT-only RLS policies for investors

DROP POLICY IF EXISTS "Investors can view orders" ON public.orders;
CREATE POLICY "Investors can view orders" ON public.orders
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view order items" ON public.order_items;
CREATE POLICY "Investors can view order items" ON public.order_items
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.is_investor(auth.uid(), o.restaurant_id)
  ));

DROP POLICY IF EXISTS "Investors can view daily reports" ON public.daily_reports;
CREATE POLICY "Investors can view daily reports" ON public.daily_reports
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view expenses" ON public.daily_expenses;
CREATE POLICY "Investors can view expenses" ON public.daily_expenses
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view debtors" ON public.debtors;
CREATE POLICY "Investors can view debtors" ON public.debtors
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view inventory" ON public.inventory;
CREATE POLICY "Investors can view inventory" ON public.inventory
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view menu items" ON public.menu_items;
CREATE POLICY "Investors can view menu items" ON public.menu_items
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view tags" ON public.menu_tags;
CREATE POLICY "Investors can view tags" ON public.menu_tags
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view tabs" ON public.tabs;
CREATE POLICY "Investors can view tabs" ON public.tabs
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view tab items" ON public.tab_items;
CREATE POLICY "Investors can view tab items" ON public.tab_items
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.tabs t
    WHERE t.id = tab_items.tab_id
      AND public.is_investor(auth.uid(), t.restaurant_id)
  ));

DROP POLICY IF EXISTS "Investors can view memberships" ON public.restaurant_memberships;
CREATE POLICY "Investors can view memberships" ON public.restaurant_memberships
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND public.is_investor(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Investors can view profiles" ON public.profiles;
CREATE POLICY "Investors can view profiles" ON public.profiles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.restaurant_memberships rm1
      JOIN public.restaurant_memberships rm2 ON rm1.restaurant_id = rm2.restaurant_id
      WHERE rm1.user_id = profiles.id
        AND rm2.user_id = auth.uid()
        AND public.is_investor(auth.uid(), rm1.restaurant_id)
    )
  );