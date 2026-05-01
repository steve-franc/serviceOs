-- 1. Add superadmin to enum (must be committed before use)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- 2. Allow restaurant_id NULL for global superadmin rows
ALTER TABLE public.user_roles ALTER COLUMN restaurant_id DROP NOT NULL;

-- 3. Add status to restaurants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='restaurants' AND column_name='status'
  ) THEN
    ALTER TABLE public.restaurants ADD COLUMN status text NOT NULL DEFAULT 'active';
    ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_status_check
      CHECK (status IN ('active','on_hold','archived'));
  END IF;
END $$;
