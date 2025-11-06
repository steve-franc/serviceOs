-- Allow authenticated users to view all menu items for ordering purposes
CREATE POLICY "Authenticated users can view all menu items for ordering"
ON public.menu_items
FOR SELECT
TO authenticated
USING (true);