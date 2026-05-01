-- Superadmin: delete a user's public footprint (auth row removed via edge function)
CREATE OR REPLACE FUNCTION public.superadmin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Cannot delete yourself'; END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.restaurant_memberships WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
END $function$;