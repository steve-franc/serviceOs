-- Add foreign key constraint from menu_items.staff_id to profiles.id
ALTER TABLE public.menu_items
DROP CONSTRAINT IF EXISTS menu_items_staff_id_fkey;

ALTER TABLE public.menu_items
ADD CONSTRAINT menu_items_staff_id_fkey 
FOREIGN KEY (staff_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;