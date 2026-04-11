-- Add source column to daily_expenses (tag name or manual input like "Food Kasa")
ALTER TABLE public.daily_expenses ADD COLUMN source text DEFAULT NULL;

-- Add fixed_monthly_expenses to restaurant_settings
ALTER TABLE public.restaurant_settings ADD COLUMN fixed_monthly_expenses numeric NOT NULL DEFAULT 0;

-- Add profit_margin_threshold to restaurant_settings (percentage, e.g. 20 means 20%)
ALTER TABLE public.restaurant_settings ADD COLUMN profit_margin_threshold numeric NOT NULL DEFAULT 20;