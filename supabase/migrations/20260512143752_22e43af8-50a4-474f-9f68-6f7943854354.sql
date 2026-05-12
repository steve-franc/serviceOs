DELETE FROM public.service_bookings WHERE order_id NOT IN (SELECT id FROM public.orders);
DELETE FROM public.service_bookings WHERE menu_item_id NOT IN (SELECT id FROM public.menu_items);
DELETE FROM public.service_bookings WHERE restaurant_id NOT IN (SELECT id FROM public.restaurants);
ALTER TABLE public.service_bookings
  ADD CONSTRAINT service_bookings_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  ADD CONSTRAINT service_bookings_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE,
  ADD CONSTRAINT service_bookings_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;