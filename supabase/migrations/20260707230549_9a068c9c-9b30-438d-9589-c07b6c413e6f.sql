REVOKE EXECUTE ON FUNCTION public.close_missing_days_for_restaurant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_day_for_restaurant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_missing_days_for_restaurant(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_day_for_restaurant(uuid) TO service_role;