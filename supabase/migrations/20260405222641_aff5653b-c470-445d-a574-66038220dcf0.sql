
-- Remove tags column from menu_items (tags are now category-level)
ALTER TABLE public.menu_items DROP COLUMN IF EXISTS tags;

-- Add category column to menu_tags
ALTER TABLE public.menu_tags ADD COLUMN category text NOT NULL DEFAULT '';

-- Drop old unique constraint and add new one
ALTER TABLE public.menu_tags DROP CONSTRAINT IF EXISTS menu_tags_restaurant_id_name_key;
ALTER TABLE public.menu_tags ADD CONSTRAINT menu_tags_restaurant_id_name_category_key UNIQUE(restaurant_id, name, category);
