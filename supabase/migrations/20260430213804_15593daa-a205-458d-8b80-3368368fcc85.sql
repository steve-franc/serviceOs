
-- Helper: is_manager_or_ops
CREATE OR REPLACE FUNCTION public.is_manager_or_ops(_user_id uuid, _restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND restaurant_id = _restaurant_id
      AND role IN ('manager','ops')
  )
$$;

-- menu_items: allow ops in addition to manager
DROP POLICY IF EXISTS "Managers can create menu items" ON public.menu_items;
CREATE POLICY "Managers and ops can create menu items"
ON public.menu_items FOR INSERT
WITH CHECK (
  public.is_manager_or_ops(auth.uid(), restaurant_id)
  AND auth.uid() = staff_id
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

DROP POLICY IF EXISTS "Managers can update menu items" ON public.menu_items;
CREATE POLICY "Managers and ops can update menu items"
ON public.menu_items FOR UPDATE
USING (
  public.is_manager_or_ops(auth.uid(), restaurant_id)
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

DROP POLICY IF EXISTS "Managers can delete menu items" ON public.menu_items;
CREATE POLICY "Managers and ops can delete menu items"
ON public.menu_items FOR DELETE
USING (
  public.is_manager_or_ops(auth.uid(), restaurant_id)
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

-- menu_tags: allow ops in addition to manager
DROP POLICY IF EXISTS "Managers can create tags" ON public.menu_tags;
CREATE POLICY "Managers and ops can create tags"
ON public.menu_tags FOR INSERT
WITH CHECK (public.is_manager_or_ops(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Managers can delete tags" ON public.menu_tags;
CREATE POLICY "Managers and ops can delete tags"
ON public.menu_tags FOR DELETE
USING (public.is_manager_or_ops(auth.uid(), restaurant_id));
