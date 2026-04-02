INSERT INTO public.restaurant_settings (restaurant_id, restaurant_name, allow_public_orders, currency)
VALUES ('f97f7226-9a9c-427d-9657-536d5c0f5f29', 'Elite Afrika Restaurant', true, 'TRY')
ON CONFLICT DO NOTHING;