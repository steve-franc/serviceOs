
-- 1) restaurants
DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
CREATE POLICY "Members can view their restaurant"
  ON public.restaurants FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.restaurant_memberships m
               WHERE m.user_id = auth.uid() AND m.restaurant_id = restaurants.id)
  );

-- 2) restaurant_settings
DROP POLICY IF EXISTS "Settings are viewable by everyone" ON public.restaurant_settings;
CREATE POLICY "Members can view their restaurant settings"
  ON public.restaurant_settings FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.restaurant_memberships m
               WHERE m.user_id = auth.uid() AND m.restaurant_id = restaurant_settings.restaurant_id)
  );

-- 3) Public-safe restaurant info RPC
CREATE OR REPLACE FUNCTION public.get_public_restaurant_info(_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _s record;
BEGIN
  SELECT id, name, status INTO _r FROM public.restaurants WHERE id = _restaurant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT restaurant_id, restaurant_name, allow_public_orders, payment_methods, logo_url, currency
    INTO _s FROM public.restaurant_settings WHERE restaurant_id = _restaurant_id;
  RETURN jsonb_build_object(
    'id', _r.id, 'name', _r.name, 'status', _r.status,
    'restaurant_id', COALESCE(_s.restaurant_id, _r.id),
    'restaurant_name', COALESCE(_s.restaurant_name, _r.name),
    'allow_public_orders', COALESCE(_s.allow_public_orders, false),
    'payment_methods', COALESCE(_s.payment_methods, '[]'::jsonb),
    'logo_url', _s.logo_url,
    'currency', COALESCE(_s.currency, 'TRY')
  );
END $$;

-- 4) Extend get_public_receipt
CREATE OR REPLACE FUNCTION public.get_public_receipt(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE _o RECORD; _items jsonb; _name text; _pm jsonb;
BEGIN
  SELECT o.id, o.order_number, o.total, o.payment_method, o.notes, o.created_at,
         o.currency, o.edited_at, o.discount_amount, o.restaurant_id
    INTO _o FROM public.orders o
    WHERE o.id = _order_id AND o.is_public_order = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT rs.restaurant_name, rs.payment_methods INTO _name, _pm
    FROM public.restaurant_settings rs WHERE rs.restaurant_id = _o.restaurant_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', oi.id, 'menu_item_name', oi.menu_item_name,
    'quantity', oi.quantity, 'price_at_time', oi.price_at_time,
    'subtotal', oi.subtotal, 'extra_units', oi.extra_units,
    'base_price_at_time', oi.base_price_at_time,
    'per_unit_price_at_time', oi.per_unit_price_at_time
  ) ORDER BY oi.id), '[]'::jsonb) INTO _items
  FROM public.order_items oi WHERE oi.order_id = _order_id;

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', _o.id, 'order_number', _o.order_number, 'total', _o.total,
      'payment_method', _o.payment_method, 'notes', _o.notes,
      'created_at', _o.created_at, 'currency', _o.currency,
      'edited_at', _o.edited_at, 'discount_amount', _o.discount_amount,
      'restaurant_id', _o.restaurant_id
    ),
    'items', _items,
    'restaurant', jsonb_build_object('name', _name, 'payment_methods', COALESCE(_pm, '[]'::jsonb))
  );
END;
$function$;

-- 5) Membership: invite-scoped self-join
DROP POLICY IF EXISTS "Users can join a restaurant for themselves" ON public.restaurant_memberships;

CREATE OR REPLACE FUNCTION public.invited_restaurant_id(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(u.raw_user_meta_data->>'join_restaurant_id','')::uuid
  FROM auth.users u WHERE u.id = _uid
$$;

CREATE POLICY "Users can self-join only via signup invite"
  ON public.restaurant_memberships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND restaurant_id = public.invited_restaurant_id(auth.uid()));

-- 6) current_restaurant_id deterministic
CREATE OR REPLACE FUNCTION public.current_restaurant_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $function$
  SELECT rm.restaurant_id FROM public.restaurant_memberships rm
  WHERE rm.user_id = _user_id
  ORDER BY rm.created_at ASC NULLS LAST, rm.restaurant_id ASC LIMIT 1
$function$;

-- 7) Profiles
DROP POLICY IF EXISTS "Managers can view all profiles" ON public.profiles;
CREATE POLICY "Managers can view co-member profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_memberships rm_mgr
      JOIN public.restaurant_memberships rm_target
        ON rm_mgr.restaurant_id = rm_target.restaurant_id
      WHERE rm_mgr.user_id = auth.uid()
        AND rm_target.user_id = profiles.id
        AND public.is_manager(auth.uid(), rm_mgr.restaurant_id)
    )
  );

-- 8) Storage dish-photos
DROP POLICY IF EXISTS "Public can view dish photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload dish photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update dish photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete dish photos" ON storage.objects;
CREATE POLICY "Managers can upload dish photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='dish-photos' AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Managers can update dish photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='dish-photos' AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Managers can delete dish photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='dish-photos' AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- 9) Storage restaurant-logos: drop broad list policy
DROP POLICY IF EXISTS "Public can view restaurant logos" ON storage.objects;

-- 10) Storage restock-invoices
DROP POLICY IF EXISTS "Public read restock invoices" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload restock invoices" ON storage.objects;
DROP POLICY IF EXISTS "Auth update restock invoices" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete restock invoices" ON storage.objects;
CREATE POLICY "Members can read restock invoices" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='restock-invoices' AND EXISTS (
    SELECT 1 FROM public.restaurant_memberships m
    WHERE m.user_id=auth.uid() AND m.restaurant_id=((storage.foldername(name))[1])::uuid));
CREATE POLICY "Members can upload restock invoices" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='restock-invoices' AND EXISTS (
    SELECT 1 FROM public.restaurant_memberships m
    WHERE m.user_id=auth.uid() AND m.restaurant_id=((storage.foldername(name))[1])::uuid));
CREATE POLICY "Managers can update restock invoices" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='restock-invoices' AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "Managers can delete restock invoices" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='restock-invoices' AND public.is_manager(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- 11) Move pg_net to extensions schema (drop+create since SET SCHEMA unsupported)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_net' AND n.nspname='public') THEN
    EXECUTE 'DROP EXTENSION pg_net';
    EXECUTE 'CREATE EXTENSION pg_net WITH SCHEMA extensions';
  END IF;
END $$;

-- 12) Revoke broad EXECUTE on SECURITY DEFINER functions; grant precisely
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_public_receipt(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_restaurant_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, text, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_public_order(uuid, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, date, date) TO anon;

-- 13) Realtime: lock down broadcast/presence
DO $$ BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "deny broadcast and presence" ON realtime.messages';
    EXECUTE 'CREATE POLICY "deny broadcast and presence" ON realtime.messages FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)';
  END IF;
END $$;
