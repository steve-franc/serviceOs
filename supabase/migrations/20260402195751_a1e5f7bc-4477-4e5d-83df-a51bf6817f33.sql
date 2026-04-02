
ALTER TABLE public.restaurant_settings
  ALTER COLUMN currency SET DEFAULT 'TRY';

ALTER TABLE public.menu_items
  ALTER COLUMN currency SET DEFAULT 'TRY';

ALTER TABLE public.orders
  ALTER COLUMN currency SET DEFAULT 'TRY';

ALTER TABLE public.tabs
  ALTER COLUMN currency SET DEFAULT 'TRY';
