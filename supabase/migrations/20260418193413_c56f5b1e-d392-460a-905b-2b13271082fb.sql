-- 1. Add 'investor' to app_role enum (must be committed before use in functions)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'investor';

-- 2. Add payment_status to orders (default 'paid')
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid';

-- 3. Add WhatsApp notification settings to restaurant_settings
ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS notify_low_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_low_margin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_new_order boolean NOT NULL DEFAULT true;