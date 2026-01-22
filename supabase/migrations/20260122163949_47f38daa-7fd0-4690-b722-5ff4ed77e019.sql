-- Restaurants
CREATE TABLE IF NOT EXISTS public.restaurants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
CREATE POLICY "Restaurants are viewable by everyone"
ON public.restaurants
FOR SELECT
USING (true);

-- Restaurant memberships (one restaurant per user)
CREATE TABLE IF NOT EXISTS public.restaurant_memberships (
  user_id UUID NOT NULL PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own restaurant membership" ON public.restaurant_memberships;
CREATE POLICY "Users can view own restaurant membership"
ON public.restaurant_memberships
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can join a restaurant for themselves" ON public.restaurant_memberships;
CREATE POLICY "Users can join a restaurant for themselves"
ON public.restaurant_memberships
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add restaurant_id to role assignments first (required for functions)
ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS restaurant_id uuid NULL REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- Helper: get current user's restaurant_id
CREATE OR REPLACE FUNCTION public.current_restaurant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rm.restaurant_id
  FROM public.restaurant_memberships rm
  WHERE rm.user_id = _user_id
  LIMIT 1
$$;

-- Restaurant-scoped roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role, _restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND restaurant_id = _restaurant_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid, _restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'manager'::app_role, _restaurant_id)
$$;

-- Add restaurant_id to domain tables
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS restaurant_id uuid NULL REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS restaurant_id uuid NULL REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.daily_reports
ADD COLUMN IF NOT EXISTS restaurant_id uuid NULL REFERENCES public.restaurants(id) ON DELETE CASCADE;

ALTER TABLE public.restaurant_settings
ADD COLUMN IF NOT EXISTS restaurant_id uuid NULL REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- Index/uniqueness: one settings row per restaurant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'restaurant_settings_restaurant_id_unique'
  ) THEN
    CREATE UNIQUE INDEX restaurant_settings_restaurant_id_unique
      ON public.restaurant_settings (restaurant_id);
  END IF;
END $$;

-- MENU ITEMS RLS
DROP POLICY IF EXISTS "Authenticated users can view all menu items for ordering" ON public.menu_items;
DROP POLICY IF EXISTS "Users can view own menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Managers can view all menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Public can view available menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Restaurant members can view menu items" ON public.menu_items;

CREATE POLICY "Public can view available menu items"
ON public.menu_items
FOR SELECT
USING (auth.uid() IS NULL AND is_available = true);

CREATE POLICY "Restaurant members can view menu items"
ON public.menu_items
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    restaurant_id = public.current_restaurant_id(auth.uid())
    OR public.is_manager(auth.uid(), restaurant_id)
  )
);

DROP POLICY IF EXISTS "Users can create own menu items" ON public.menu_items;
CREATE POLICY "Users can create own menu items"
ON public.menu_items
FOR INSERT
WITH CHECK (
  auth.uid() = staff_id
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

DROP POLICY IF EXISTS "Users can update own menu items" ON public.menu_items;
CREATE POLICY "Users can update own menu items"
ON public.menu_items
FOR UPDATE
USING (
  (auth.uid() = staff_id AND restaurant_id = public.current_restaurant_id(auth.uid()))
  OR public.is_manager(auth.uid(), restaurant_id)
);

DROP POLICY IF EXISTS "Users can delete own menu items" ON public.menu_items;
CREATE POLICY "Users can delete own menu items"
ON public.menu_items
FOR DELETE
USING (
  (auth.uid() = staff_id AND restaurant_id = public.current_restaurant_id(auth.uid()))
  OR public.is_manager(auth.uid(), restaurant_id)
);

-- ORDERS RLS
DROP POLICY IF EXISTS "Users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders they created" ON public.orders;
DROP POLICY IF EXISTS "Managers can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Restaurant members can view orders" ON public.orders;

CREATE POLICY "Restaurant members can view orders"
ON public.orders
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    restaurant_id = public.current_restaurant_id(auth.uid())
    OR public.is_manager(auth.uid(), restaurant_id)
  )
);

DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;

CREATE POLICY "Users can create orders"
ON public.orders
FOR INSERT
WITH CHECK (
  CASE
    WHEN is_public_order = true THEN restaurant_id IS NOT NULL
    ELSE (auth.uid() = staff_id AND restaurant_id = public.current_restaurant_id(auth.uid()))
  END
);

DROP POLICY IF EXISTS "Staff can update own orders" ON public.orders;
CREATE POLICY "Staff can update own orders"
ON public.orders
FOR UPDATE
USING (
  (auth.uid() = staff_id AND restaurant_id = public.current_restaurant_id(auth.uid()))
  OR public.is_manager(auth.uid(), restaurant_id)
);

DROP POLICY IF EXISTS "Staff can delete own orders" ON public.orders;
CREATE POLICY "Staff can delete own orders"
ON public.orders
FOR DELETE
USING (
  (auth.uid() = staff_id AND restaurant_id = public.current_restaurant_id(auth.uid()))
  OR public.is_manager(auth.uid(), restaurant_id)
);

-- ORDER ITEMS RLS (via parent order)
DROP POLICY IF EXISTS "Users can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Managers can manage all order items" ON public.order_items;

CREATE POLICY "Users can view order items"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND auth.uid() IS NOT NULL
      AND (
        o.restaurant_id = public.current_restaurant_id(auth.uid())
        OR public.is_manager(auth.uid(), o.restaurant_id)
      )
  )
);

CREATE POLICY "Users can create order items"
ON public.order_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        (o.is_public_order = true)
        OR (auth.uid() = o.staff_id AND o.restaurant_id = public.current_restaurant_id(auth.uid()))
        OR public.is_manager(auth.uid(), o.restaurant_id)
      )
  )
);

-- DAILY REPORTS RLS
DROP POLICY IF EXISTS "Users can view own daily reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Managers can view all daily reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Restaurant members can view daily reports" ON public.daily_reports;

CREATE POLICY "Restaurant members can view daily reports"
ON public.daily_reports
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    restaurant_id = public.current_restaurant_id(auth.uid())
    OR public.is_manager(auth.uid(), restaurant_id)
  )
);

DROP POLICY IF EXISTS "Users can create own daily reports" ON public.daily_reports;
CREATE POLICY "Users can create own daily reports"
ON public.daily_reports
FOR INSERT
WITH CHECK (
  auth.uid() = staff_id
  AND restaurant_id = public.current_restaurant_id(auth.uid())
);

-- RESTAURANT SETTINGS RLS
DROP POLICY IF EXISTS "Only managers can insert settings" ON public.restaurant_settings;
DROP POLICY IF EXISTS "Only managers can update settings" ON public.restaurant_settings;
DROP POLICY IF EXISTS "Managers can insert own restaurant settings" ON public.restaurant_settings;
DROP POLICY IF EXISTS "Managers can update own restaurant settings" ON public.restaurant_settings;

CREATE POLICY "Managers can insert own restaurant settings"
ON public.restaurant_settings
FOR INSERT
WITH CHECK (public.is_manager(auth.uid(), restaurant_id));

CREATE POLICY "Managers can update own restaurant settings"
ON public.restaurant_settings
FOR UPDATE
USING (public.is_manager(auth.uid(), restaurant_id));
