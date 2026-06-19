CREATE TABLE public.buy_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'units',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','purchased','cancelled')),
  for_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,
  purchased_by UUID,
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buy_list_items TO authenticated;
GRANT ALL ON public.buy_list_items TO service_role;

ALTER TABLE public.buy_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view buy list"
  ON public.buy_list_items FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurant_memberships m WHERE m.restaurant_id = buy_list_items.restaurant_id AND m.user_id = auth.uid()));

CREATE POLICY "Members can add buy list items"
  ON public.buy_list_items FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.restaurant_memberships m WHERE m.restaurant_id = buy_list_items.restaurant_id AND m.user_id = auth.uid())
  );

CREATE POLICY "Members can update buy list"
  ON public.buy_list_items FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurant_memberships m WHERE m.restaurant_id = buy_list_items.restaurant_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurant_memberships m WHERE m.restaurant_id = buy_list_items.restaurant_id AND m.user_id = auth.uid()));

CREATE POLICY "Members can delete buy list"
  ON public.buy_list_items FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurant_memberships m WHERE m.restaurant_id = buy_list_items.restaurant_id AND m.user_id = auth.uid()));

CREATE INDEX idx_buy_list_restaurant_date ON public.buy_list_items(restaurant_id, for_date DESC);

CREATE TRIGGER update_buy_list_items_updated_at
  BEFORE UPDATE ON public.buy_list_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();