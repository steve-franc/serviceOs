ALTER TABLE public.tab_items DROP CONSTRAINT IF EXISTS tab_items_menu_item_id_fkey;
ALTER TABLE public.tab_items
  ADD CONSTRAINT tab_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;