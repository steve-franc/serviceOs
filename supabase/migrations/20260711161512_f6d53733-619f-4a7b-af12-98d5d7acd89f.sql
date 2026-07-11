DROP POLICY IF EXISTS "Public can view available menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Restaurant members can view menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Investors can view menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Managers and ops can create menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Managers and ops can update menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Managers and ops can delete menu items" ON public.menu_items;

CREATE POLICY "Public can view available menu items"
ON public.menu_items
FOR SELECT
TO anon
USING (is_available = true AND is_public = true);

CREATE POLICY "Restaurant members can view menu items"
ON public.menu_items
FOR SELECT
TO authenticated
USING (
  restaurant_id = public.current_restaurant_id(auth.uid())
  OR public.is_manager(auth.uid(), restaurant_id)
);

CREATE POLICY "Investors can view menu items"
ON public.menu_items
FOR SELECT
TO authenticated
USING (public.is_investor(auth.uid(), restaurant_id));

CREATE POLICY "Managers and ops can create menu items"
ON public.menu_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager_or_ops(auth.uid(), restaurant_id)
  AND auth.uid() = staff_id
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

CREATE POLICY "Managers and ops can update menu items"
ON public.menu_items
FOR UPDATE
TO authenticated
USING (
  public.is_manager_or_ops(auth.uid(), restaurant_id)
  AND restaurant_id = public.current_restaurant_id(auth.uid())
)
WITH CHECK (
  public.is_manager_or_ops(auth.uid(), restaurant_id)
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

CREATE POLICY "Managers and ops can delete menu items"
ON public.menu_items
FOR DELETE
TO authenticated
USING (
  public.is_manager_or_ops(auth.uid(), restaurant_id)
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

REVOKE EXECUTE ON FUNCTION public.current_restaurant_id(uuid) FROM anon;