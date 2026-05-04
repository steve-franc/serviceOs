-- =========================================
-- 1. Subscription tiers
-- =========================================
CREATE TABLE public.subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price_try numeric NOT NULL DEFAULT 0,
  dodo_price_id_test text,
  dodo_price_id_live text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_free boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active tiers"
  ON public.subscription_tiers FOR SELECT
  TO authenticated
  USING (is_active = true OR public.is_superadmin(auth.uid()));

CREATE POLICY "Superadmins manage tiers"
  ON public.subscription_tiers FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_subscription_tiers_updated
  BEFORE UPDATE ON public.subscription_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default tiers
INSERT INTO public.subscription_tiers (slug, name, price_try, is_free, display_order, features) VALUES
  ('free', 'Free', 0, true, 0, jsonb_build_object(
    'max_menu_items', 15,
    'public_ordering', false,
    'bookings', false,
    'reports_days', 7,
    'staff_seats', 2,
    'exports', false
  )),
  ('pro', 'Pro', 499, false, 1, jsonb_build_object(
    'max_menu_items', null,
    'public_ordering', true,
    'bookings', true,
    'reports_days', null,
    'staff_seats', 10,
    'exports', false
  )),
  ('business', 'Business', 1499, false, 2, jsonb_build_object(
    'max_menu_items', null,
    'public_ordering', true,
    'bookings', true,
    'reports_days', null,
    'staff_seats', null,
    'exports', true
  ));

-- =========================================
-- 2. Restaurant subscription fields
-- =========================================
ALTER TABLE public.restaurants
  ADD COLUMN tier_id uuid REFERENCES public.subscription_tiers(id),
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'free',
  ADD COLUMN current_period_end timestamptz,
  ADD COLUMN dodo_customer_id text,
  ADD COLUMN dodo_subscription_id text;

-- Default every existing restaurant to Free
UPDATE public.restaurants
   SET tier_id = (SELECT id FROM public.subscription_tiers WHERE slug = 'free')
 WHERE tier_id IS NULL;

-- Validation trigger for subscription_status (instead of CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_subscription_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subscription_status NOT IN ('free','active','past_due','cancelled') THEN
    RAISE EXCEPTION 'Invalid subscription_status: %', NEW.subscription_status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_restaurants_validate_sub_status
  BEFORE INSERT OR UPDATE OF subscription_status ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.validate_subscription_status();

-- =========================================
-- 3. Platform settings (singleton)
-- =========================================
CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true,
  payment_mode text NOT NULL DEFAULT 'test',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = true)
);

INSERT INTO public.platform_settings (id, payment_mode) VALUES (true, 'test');

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read platform settings"
  ON public.platform_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Superadmins can update platform settings"
  ON public.platform_settings FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_payment_mode()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_mode NOT IN ('test','live') THEN
    RAISE EXCEPTION 'payment_mode must be test or live';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_platform_settings_validate
  BEFORE INSERT OR UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_mode();

-- =========================================
-- 4. Billing events log
-- =========================================
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  dodo_event_id text,
  dodo_subscription_id text,
  amount_try numeric,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_events_restaurant ON public.billing_events(restaurant_id, created_at DESC);
CREATE INDEX idx_billing_events_dodo_event ON public.billing_events(dodo_event_id);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers view own restaurant billing events"
  ON public.billing_events FOR SELECT
  TO authenticated
  USING (restaurant_id IS NOT NULL AND public.is_manager(auth.uid(), restaurant_id));

CREATE POLICY "Superadmins manage all billing events"
  ON public.billing_events FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- =========================================
-- 5. Helper functions
-- =========================================

-- Get effective features for a restaurant (current tier's features)
CREATE OR REPLACE FUNCTION public.get_restaurant_features(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(t.features, '{}'::jsonb)
  FROM public.restaurants r
  LEFT JOIN public.subscription_tiers t ON t.id = r.tier_id
  WHERE r.id = _restaurant_id
$$;

-- List subscriptions for superadmin billing dashboard
CREATE OR REPLACE FUNCTION public.superadmin_list_subscriptions()
RETURNS TABLE (
  restaurant_id uuid,
  restaurant_name text,
  tier_id uuid,
  tier_name text,
  tier_slug text,
  tier_price_try numeric,
  subscription_status text,
  current_period_end timestamptz,
  dodo_subscription_id text,
  lifetime_paid_try numeric,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT
    r.id, r.name, r.tier_id, t.name, t.slug, t.price_try,
    r.subscription_status, r.current_period_end, r.dodo_subscription_id,
    COALESCE((SELECT sum(amount_try) FROM public.billing_events be
              WHERE be.restaurant_id = r.id AND be.event_type IN ('subscription.active','subscription.renewed')), 0),
    r.created_at
  FROM public.restaurants r
  LEFT JOIN public.subscription_tiers t ON t.id = r.tier_id
  ORDER BY r.created_at DESC;
END $$;

-- Tier upsert (superadmin only)
CREATE OR REPLACE FUNCTION public.superadmin_upsert_tier(
  _id uuid,
  _slug text,
  _name text,
  _price_try numeric,
  _dodo_price_id_test text,
  _dodo_price_id_live text,
  _features jsonb,
  _display_order int,
  _is_active boolean,
  _is_free boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _new_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF btrim(COALESCE(_slug,'')) = '' OR btrim(COALESCE(_name,'')) = '' THEN
    RAISE EXCEPTION 'Slug and name required';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.subscription_tiers (slug, name, price_try, dodo_price_id_test, dodo_price_id_live, features, display_order, is_active, is_free)
    VALUES (_slug, _name, GREATEST(_price_try,0), NULLIF(_dodo_price_id_test,''), NULLIF(_dodo_price_id_live,''), COALESCE(_features,'{}'::jsonb), COALESCE(_display_order,0), COALESCE(_is_active,true), COALESCE(_is_free,false))
    RETURNING id INTO _new_id;
    RETURN _new_id;
  ELSE
    UPDATE public.subscription_tiers SET
      slug = _slug,
      name = _name,
      price_try = GREATEST(_price_try,0),
      dodo_price_id_test = NULLIF(_dodo_price_id_test,''),
      dodo_price_id_live = NULLIF(_dodo_price_id_live,''),
      features = COALESCE(_features,'{}'::jsonb),
      display_order = COALESCE(_display_order,0),
      is_active = COALESCE(_is_active,true),
      is_free = COALESCE(_is_free,false)
    WHERE id = _id;
    RETURN _id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_delete_tier(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _in_use int;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT count(*) INTO _in_use FROM public.restaurants WHERE tier_id = _id;
  IF _in_use > 0 THEN RAISE EXCEPTION 'Tier is in use by % restaurant(s)', _in_use; END IF;
  DELETE FROM public.subscription_tiers WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_set_platform_mode(_mode text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _mode NOT IN ('test','live') THEN RAISE EXCEPTION 'Invalid mode'; END IF;
  UPDATE public.platform_settings SET payment_mode = _mode WHERE id = true;
END $$;

-- Apply a webhook subscription event (used by edge function via service role)
CREATE OR REPLACE FUNCTION public.dodo_handle_subscription_event(
  _restaurant_id uuid,
  _tier_id uuid,
  _event_type text,
  _dodo_event_id text,
  _dodo_subscription_id text,
  _dodo_customer_id text,
  _amount_try numeric,
  _current_period_end timestamptz,
  _payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _free_tier uuid;
BEGIN
  -- Idempotency: skip if we've already processed this event id
  IF _dodo_event_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.billing_events WHERE dodo_event_id = _dodo_event_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.billing_events (restaurant_id, event_type, dodo_event_id, dodo_subscription_id, amount_try, payload)
  VALUES (_restaurant_id, _event_type, _dodo_event_id, _dodo_subscription_id, _amount_try, _payload);

  IF _restaurant_id IS NULL THEN RETURN; END IF;

  IF _event_type IN ('subscription.active','subscription.renewed') THEN
    UPDATE public.restaurants
       SET tier_id = COALESCE(_tier_id, tier_id),
           subscription_status = 'active',
           current_period_end = COALESCE(_current_period_end, current_period_end),
           dodo_subscription_id = COALESCE(_dodo_subscription_id, dodo_subscription_id),
           dodo_customer_id = COALESCE(_dodo_customer_id, dodo_customer_id)
     WHERE id = _restaurant_id;
  ELSIF _event_type = 'subscription.failed' THEN
    UPDATE public.restaurants SET subscription_status = 'past_due' WHERE id = _restaurant_id;
  ELSIF _event_type = 'subscription.cancelled' THEN
    SELECT id INTO _free_tier FROM public.subscription_tiers WHERE slug = 'free' LIMIT 1;
    UPDATE public.restaurants
       SET subscription_status = 'free',
           tier_id = COALESCE(_free_tier, tier_id),
           dodo_subscription_id = NULL
     WHERE id = _restaurant_id;
  END IF;
END $$;

-- Sweep expired subscriptions to Free
CREATE OR REPLACE FUNCTION public.subscription_sweep_expired()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _free uuid; _count int := 0;
BEGIN
  SELECT id INTO _free FROM public.subscription_tiers WHERE slug = 'free' LIMIT 1;
  IF _free IS NULL THEN RAISE EXCEPTION 'Free tier missing'; END IF;
  WITH downgraded AS (
    UPDATE public.restaurants
       SET tier_id = _free,
           subscription_status = 'free',
           dodo_subscription_id = NULL
     WHERE subscription_status IN ('active','past_due')
       AND current_period_end IS NOT NULL
       AND current_period_end < now() - interval '1 day'
    RETURNING id
  )
  SELECT count(*) INTO _count FROM downgraded;
  RETURN jsonb_build_object('downgraded', _count, 'at', now());
END $$;

-- Manager-facing: get my subscription details
CREATE OR REPLACE FUNCTION public.get_my_subscription(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _r record; _t record;
BEGIN
  IF NOT (public.is_manager(auth.uid(), _restaurant_id) OR public.is_superadmin(auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO _r FROM public.restaurants WHERE id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant not found'; END IF;
  SELECT * INTO _t FROM public.subscription_tiers WHERE id = _r.tier_id;
  RETURN jsonb_build_object(
    'tier', to_jsonb(_t),
    'subscription_status', _r.subscription_status,
    'current_period_end', _r.current_period_end,
    'dodo_subscription_id', _r.dodo_subscription_id
  );
END $$;

-- Enforce max_menu_items on insert
CREATE OR REPLACE FUNCTION public.enforce_menu_item_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _features jsonb; _max int; _current int;
BEGIN
  _features := public.get_restaurant_features(NEW.restaurant_id);
  _max := NULLIF(_features->>'max_menu_items', '')::int;
  IF _max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO _current FROM public.menu_items WHERE restaurant_id = NEW.restaurant_id;
  IF _current >= _max THEN
    RAISE EXCEPTION 'Your plan allows up to % menu items. Upgrade to add more.', _max USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_menu_item_limit
  BEFORE INSERT ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_menu_item_limit();

-- Enforce staff seat limit on restaurant_memberships insert
CREATE OR REPLACE FUNCTION public.enforce_staff_seat_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _features jsonb; _max int; _current int;
BEGIN
  _features := public.get_restaurant_features(NEW.restaurant_id);
  _max := NULLIF(_features->>'staff_seats', '')::int;
  IF _max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO _current FROM public.restaurant_memberships WHERE restaurant_id = NEW.restaurant_id;
  IF _current >= _max THEN
    RAISE EXCEPTION 'Your plan allows up to % staff seats. Upgrade to add more.', _max USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_staff_seat_limit
  BEFORE INSERT ON public.restaurant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_seat_limit();