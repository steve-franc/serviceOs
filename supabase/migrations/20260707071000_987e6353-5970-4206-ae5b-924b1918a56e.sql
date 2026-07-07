
CREATE TABLE IF NOT EXISTS public.manual_close_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  auto_restart_attempted boolean NOT NULL DEFAULT true,
  auto_restart_success boolean,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.manual_close_log TO authenticated;
GRANT ALL ON public.manual_close_log TO service_role;

ALTER TABLE public.manual_close_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their restaurant close logs"
  ON public.manual_close_log
  FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM public.restaurant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert their restaurant close logs"
  ON public.manual_close_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id FROM public.restaurant_memberships WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS manual_close_log_restaurant_closed_at_idx
  ON public.manual_close_log (restaurant_id, closed_at DESC);
