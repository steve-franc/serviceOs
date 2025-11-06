-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow admins to view all daily reports
CREATE POLICY "Admins can view all daily reports"
ON public.daily_reports
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Allow admins to view all menu items
CREATE POLICY "Admins can view all menu items"
ON public.menu_items
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));