
DROP POLICY IF EXISTS "Anonymous users can create public orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;

CREATE POLICY "Public and staff can create orders"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  (
    is_public_order = true
    AND restaurant_id IS NOT NULL
    AND discount_amount = 0
  )
  OR
  (
    is_public_order = false
    AND auth.uid() = staff_id
    AND restaurant_id = current_restaurant_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated users can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Anonymous users can create public order items" ON public.order_items;

CREATE POLICY "Public and staff can create order items"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.is_public_order = true
        OR (
          auth.uid() = o.staff_id
          AND o.restaurant_id = current_restaurant_id(auth.uid())
        )
        OR is_manager(auth.uid(), o.restaurant_id)
      )
  )
);
