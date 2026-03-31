
CREATE POLICY "Staff can update order items"
ON public.order_items FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      (auth.uid() = o.staff_id AND o.restaurant_id = current_restaurant_id(auth.uid()))
      OR is_manager(auth.uid(), o.restaurant_id)
    )
  )
);

CREATE POLICY "Staff can delete order items"
ON public.order_items FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      (auth.uid() = o.staff_id AND o.restaurant_id = current_restaurant_id(auth.uid()))
      OR is_manager(auth.uid(), o.restaurant_id)
    )
  )
);
