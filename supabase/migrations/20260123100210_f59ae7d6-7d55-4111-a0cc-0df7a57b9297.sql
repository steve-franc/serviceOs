-- Fix user_roles RLS policies to use restaurant-scoped manager function
DROP POLICY IF EXISTS "Managers can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Managers can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Managers can manage roles for their restaurant"
ON public.user_roles
FOR ALL
USING (public.is_manager(auth.uid(), restaurant_id))
WITH CHECK (public.is_manager(auth.uid(), restaurant_id));
