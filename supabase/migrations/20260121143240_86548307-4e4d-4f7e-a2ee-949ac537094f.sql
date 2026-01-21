-- Drop ALL policies that might reference has_role function
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders they created" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage all order items" ON public.order_items;
DROP POLICY IF EXISTS "Only admins can insert settings" ON public.restaurant_settings;
DROP POLICY IF EXISTS "Only admins can update settings" ON public.restaurant_settings;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all daily reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Admins can view all menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Restaurants can delete their own menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Restaurants can insert their own menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Restaurants can update their own menu items" ON public.menu_items;

-- Drop the functions with CASCADE to remove any remaining dependencies
DROP FUNCTION IF EXISTS public.has_role(_user_id uuid, _role public.app_role) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_role() CASCADE;

-- Create temporary text column for migration
ALTER TABLE public.user_roles ADD COLUMN role_temp text;
UPDATE public.user_roles SET role_temp = role::text;
ALTER TABLE public.user_roles DROP COLUMN role;

-- Now recreate the enum with new values
DROP TYPE public.app_role;
CREATE TYPE public.app_role AS ENUM ('server', 'ops', 'counter', 'manager');

-- Add role column back with new enum type
ALTER TABLE public.user_roles ADD COLUMN role public.app_role NOT NULL DEFAULT 'server';

-- Convert old roles to new: all become 'server' (manager will be assigned manually)
UPDATE public.user_roles SET role = 'server';

-- Drop temp column
ALTER TABLE public.user_roles DROP COLUMN role_temp;

-- Recreate the has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create helper function to check if user is manager
CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'manager'
  )
$$;

-- Recreate the handle_new_user_role function - all new users get 'server' role
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'server'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN new;
END;
$$;

-- Recreate trigger for new user roles
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Recreate RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Managers can view all roles" ON public.user_roles
  FOR SELECT USING (public.is_manager(auth.uid()));

CREATE POLICY "Managers can manage all roles" ON public.user_roles
  FOR ALL USING (public.is_manager(auth.uid()));

-- Recreate RLS policies for orders (manager = full access)
CREATE POLICY "Managers can manage all orders" ON public.orders
  FOR ALL USING (public.is_manager(auth.uid()));

CREATE POLICY "Users can view orders they created" ON public.orders
  FOR SELECT USING ((auth.uid() = staff_id) OR public.is_manager(auth.uid()));

-- Recreate RLS policies for order_items
CREATE POLICY "Managers can manage all order items" ON public.order_items
  FOR ALL USING (public.is_manager(auth.uid()));

-- Recreate RLS policies for restaurant_settings
CREATE POLICY "Only managers can insert settings" ON public.restaurant_settings
  FOR INSERT WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "Only managers can update settings" ON public.restaurant_settings
  FOR UPDATE USING (public.is_manager(auth.uid()));

-- Recreate RLS policies for profiles
CREATE POLICY "Managers can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_manager(auth.uid()));

-- Recreate RLS policies for daily_reports
CREATE POLICY "Managers can view all daily reports" ON public.daily_reports
  FOR SELECT USING (public.is_manager(auth.uid()));

-- Recreate RLS policies for menu_items
CREATE POLICY "Managers can view all menu items" ON public.menu_items
  FOR SELECT USING (public.is_manager(auth.uid()));