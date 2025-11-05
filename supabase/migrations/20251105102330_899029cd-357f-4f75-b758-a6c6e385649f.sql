-- Add currency and dual pricing support
ALTER TABLE public.menu_items 
  DROP COLUMN price,
  ADD COLUMN base_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN per_unit_price numeric DEFAULT NULL,
  ADD COLUMN currency text NOT NULL DEFAULT 'USD';

-- Add currency to orders
ALTER TABLE public.orders
  ADD COLUMN currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN customer_email text,
  ADD COLUMN customer_name text,
  ADD COLUMN is_public_order boolean NOT NULL DEFAULT false;

-- Add extra units tracking to order_items
ALTER TABLE public.order_items
  ADD COLUMN extra_units integer NOT NULL DEFAULT 0,
  ADD COLUMN base_price_at_time numeric NOT NULL DEFAULT 0,
  ADD COLUMN per_unit_price_at_time numeric;

-- Update existing order_items to use new structure
UPDATE public.order_items
SET base_price_at_time = price_at_time
WHERE base_price_at_time = 0;

-- Create settings table for restaurant configuration
CREATE TABLE public.restaurant_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  currency text NOT NULL DEFAULT 'USD',
  restaurant_name text NOT NULL DEFAULT 'Restaurant',
  allow_public_orders boolean NOT NULL DEFAULT true
);

-- Enable RLS on settings
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for settings
CREATE POLICY "Settings are viewable by everyone" 
ON public.restaurant_settings 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can update settings" 
ON public.restaurant_settings 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can insert settings" 
ON public.restaurant_settings 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Insert default settings
INSERT INTO public.restaurant_settings (currency, restaurant_name, allow_public_orders)
VALUES ('USD', 'Restaurant', true);

-- Update trigger for settings
CREATE TRIGGER update_restaurant_settings_updated_at
BEFORE UPDATE ON public.restaurant_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Allow public orders to be created without authentication
DROP POLICY IF EXISTS "Authenticated users can create orders" ON public.orders;

CREATE POLICY "Users can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (
  CASE 
    WHEN is_public_order = true THEN true
    ELSE auth.uid() = staff_id
  END
);

-- Allow public to create order items
DROP POLICY IF EXISTS "Authenticated users can create order items" ON public.order_items;

CREATE POLICY "Users can create order items" 
ON public.order_items 
FOR INSERT 
WITH CHECK (true);

-- Allow public to view orders (for their receipt)
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;

CREATE POLICY "Users can view orders" 
ON public.orders 
FOR SELECT 
USING (true);

-- Allow public to view order items
DROP POLICY IF EXISTS "Authenticated users can view order items" ON public.order_items;

CREATE POLICY "Users can view order items" 
ON public.order_items 
FOR SELECT 
USING (true);