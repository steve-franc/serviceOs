-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
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

-- RLS policies for user_roles table
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update menu_items RLS policies for restaurants
DROP POLICY IF EXISTS "Staff can insert their own menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Staff can update their own menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Staff can delete their own menu items" ON public.menu_items;

CREATE POLICY "Restaurants can insert their own menu items"
ON public.menu_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = staff_id AND 
  public.has_role(auth.uid(), 'restaurant')
);

CREATE POLICY "Restaurants can update their own menu items"
ON public.menu_items
FOR UPDATE
TO authenticated
USING (
  auth.uid() = staff_id AND 
  public.has_role(auth.uid(), 'restaurant')
);

CREATE POLICY "Restaurants can delete their own menu items"
ON public.menu_items
FOR DELETE
TO authenticated
USING (
  auth.uid() = staff_id AND 
  public.has_role(auth.uid(), 'restaurant')
);

-- Update orders RLS policies
DROP POLICY IF EXISTS "Staff can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;

CREATE POLICY "Users can view orders they created"
ON public.orders
FOR SELECT
TO authenticated
USING (
  auth.uid() = staff_id OR
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Authenticated users can create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = staff_id);

-- Add a trigger to automatically assign 'user' role to new signups
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_role();