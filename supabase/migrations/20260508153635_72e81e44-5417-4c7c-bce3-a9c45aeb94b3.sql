CREATE OR REPLACE FUNCTION public.superadmin_assign_tier(_restaurant_id uuid, _tier_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _restaurant_id IS NULL OR _tier_id IS NULL THEN RAISE EXCEPTION 'restaurant_id and tier_id required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscription_tiers WHERE id = _tier_id) THEN
    RAISE EXCEPTION 'Tier not found';
  END IF;
  UPDATE public.restaurants SET tier_id = _tier_id WHERE id = _restaurant_id;
END $$;