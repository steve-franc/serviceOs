
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;

CREATE POLICY "Authenticated users can create orders"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  (
    (auth.uid() = staff_id) AND (restaurant_id = current_restaurant_id(auth.uid()))
  )
  OR
  (
    is_public_order = true AND restaurant_id IS NOT NULL AND discount_amount = 0
  )
);
