ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'restaurant';

UPDATE public.restaurants SET business_type = 'restaurant' WHERE business_type IS NULL OR business_type = '';