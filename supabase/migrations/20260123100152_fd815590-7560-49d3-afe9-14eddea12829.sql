-- Allow restaurant managers to manage memberships for their restaurant
DROP POLICY IF EXISTS "Managers can view restaurant memberships" ON public.restaurant_memberships;
CREATE POLICY "Managers can view restaurant memberships"
ON public.restaurant_memberships
FOR SELECT
USING (public.is_manager(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Managers can add restaurant memberships" ON public.restaurant_memberships;
CREATE POLICY "Managers can add restaurant memberships"
ON public.restaurant_memberships
FOR INSERT
WITH CHECK (public.is_manager(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Managers can remove restaurant memberships" ON public.restaurant_memberships;
CREATE POLICY "Managers can remove restaurant memberships"
ON public.restaurant_memberships
FOR DELETE
USING (public.is_manager(auth.uid(), restaurant_id));
