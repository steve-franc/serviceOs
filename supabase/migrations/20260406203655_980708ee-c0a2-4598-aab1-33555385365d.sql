
ALTER TABLE public.restaurant_settings
ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '["Cash", "Card"]'::jsonb;

-- Backfill existing rows with the old default methods
UPDATE public.restaurant_settings
SET payment_methods = '["Cash", "Card", "Naira", "SFX", "IBAN", "Koopbank"]'::jsonb
WHERE payment_methods = '["Cash", "Card"]'::jsonb;
