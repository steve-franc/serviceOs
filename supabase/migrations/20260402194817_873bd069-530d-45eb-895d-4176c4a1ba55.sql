
-- Drop existing INSERT policy on orders
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;

-- Create separate policies for authenticated and anonymous users
CREATE POLICY "Authenticated users can create orders"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = staff_id) AND (restaurant_id = current_restaurant_id(auth.uid()))
);

CREATE POLICY "Anonymous users can create public orders"
ON public.orders FOR INSERT TO anon
WITH CHECK (
  is_public_order = true AND restaurant_id IS NOT NULL AND discount_amount = 0
);

-- Also fix order_items INSERT for anonymous users
DROP POLICY IF EXISTS "Users can create order items" ON public.order_items;

CREATE POLICY "Authenticated users can create order items"
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      (auth.uid() = o.staff_id AND o.restaurant_id = current_restaurant_id(auth.uid()))
      OR is_manager(auth.uid(), o.restaurant_id)
    )
  )
);

CREATE POLICY "Anonymous users can create public order items"
ON public.order_items FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id AND o.is_public_order = true
  )
);
