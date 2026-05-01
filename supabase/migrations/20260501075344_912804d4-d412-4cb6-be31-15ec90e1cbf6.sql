-- Broadcasts table for superadmin mass communication
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  cta_label text,
  cta_url text,
  variant text NOT NULL DEFAULT 'info', -- info | warning | success | promo
  audience text NOT NULL DEFAULT 'all', -- all | restaurant | superadmins
  restaurant_id uuid,
  -- Frequency: how often to re-show after dismissal (in hours). 0 = once only.
  frequency_hours integer NOT NULL DEFAULT 24,
  -- Total times to show per user (0 = unlimited until expires)
  max_shows integer NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.broadcast_views (
  broadcast_id uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  shows_count integer NOT NULL DEFAULT 0,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_dismissed_at timestamptz,
  PRIMARY KEY (broadcast_id, user_id)
);

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage broadcasts" ON public.broadcasts
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "Authenticated can read active broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated USING (is_active = true AND (expires_at IS NULL OR expires_at > now()) AND starts_at <= now());

CREATE POLICY "Users manage own views" ON public.broadcast_views
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Superadmins read all views" ON public.broadcast_views
  FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));

-- Get the next broadcast to show the current user (respects frequency + max_shows)
CREATE OR REPLACE FUNCTION public.get_active_broadcast_for_user()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_super boolean;
  _rest_id uuid;
  _row record;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  _is_super := public.is_superadmin(_uid);
  _rest_id := public.current_restaurant_id(_uid);

  SELECT b.* INTO _row
  FROM public.broadcasts b
  LEFT JOIN public.broadcast_views v ON v.broadcast_id = b.id AND v.user_id = _uid
  WHERE b.is_active = true
    AND b.starts_at <= now()
    AND (b.expires_at IS NULL OR b.expires_at > now())
    AND (
      b.audience = 'all'
      OR (b.audience = 'superadmins' AND _is_super)
      OR (b.audience = 'restaurant' AND b.restaurant_id = _rest_id)
    )
    AND (b.max_shows = 0 OR COALESCE(v.shows_count, 0) < b.max_shows)
    AND (
      v.last_dismissed_at IS NULL
      OR b.frequency_hours = 0 AND COALESCE(v.shows_count, 0) = 0
      OR (b.frequency_hours > 0 AND v.last_dismissed_at < now() - make_interval(hours => b.frequency_hours))
    )
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(_row);
END $$;

CREATE OR REPLACE FUNCTION public.mark_broadcast_seen(_broadcast_id uuid, _dismissed boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.broadcast_views (broadcast_id, user_id, shows_count, last_seen_at, last_dismissed_at)
  VALUES (_broadcast_id, _uid, 1, now(), CASE WHEN _dismissed THEN now() ELSE NULL END)
  ON CONFLICT (broadcast_id, user_id) DO UPDATE SET
    shows_count = public.broadcast_views.shows_count + 1,
    last_seen_at = now(),
    last_dismissed_at = CASE WHEN _dismissed THEN now() ELSE public.broadcast_views.last_dismissed_at END;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_create_broadcast(
  _title text, _body text, _cta_label text, _cta_url text,
  _variant text, _audience text, _restaurant_id uuid,
  _frequency_hours integer, _max_shows integer, _expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF btrim(COALESCE(_title,'')) = '' OR btrim(COALESCE(_body,'')) = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;
  INSERT INTO public.broadcasts (title, body, cta_label, cta_url, variant, audience, restaurant_id, frequency_hours, max_shows, expires_at, created_by)
  VALUES (_title, _body, NULLIF(_cta_label,''), NULLIF(_cta_url,''), COALESCE(_variant,'info'), COALESCE(_audience,'all'), _restaurant_id, GREATEST(COALESCE(_frequency_hours,24),0), GREATEST(COALESCE(_max_shows,0),0), _expires_at, auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_list_broadcasts()
RETURNS TABLE(id uuid, title text, body text, cta_label text, cta_url text, variant text, audience text, restaurant_id uuid, frequency_hours int, max_shows int, starts_at timestamptz, expires_at timestamptz, is_active boolean, created_at timestamptz, total_views int, total_dismissed int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  SELECT b.id, b.title, b.body, b.cta_label, b.cta_url, b.variant, b.audience, b.restaurant_id, b.frequency_hours, b.max_shows, b.starts_at, b.expires_at, b.is_active, b.created_at,
    COALESCE((SELECT count(*)::int FROM public.broadcast_views v WHERE v.broadcast_id = b.id), 0),
    COALESCE((SELECT count(*)::int FROM public.broadcast_views v WHERE v.broadcast_id = b.id AND v.last_dismissed_at IS NOT NULL), 0)
  FROM public.broadcasts b
  ORDER BY b.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_toggle_broadcast(_id uuid, _active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.broadcasts SET is_active = _active WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_delete_broadcast(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  DELETE FROM public.broadcasts WHERE id = _id;
END $$;

-- Promote/demote superadmin (cannot demote self)
CREATE OR REPLACE FUNCTION public.superadmin_set_superadmin(_user_id uuid, _grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _user_id = auth.uid() AND NOT _grant THEN
    RAISE EXCEPTION 'Cannot revoke your own superadmin status';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role, restaurant_id)
    VALUES (_user_id, 'superadmin'::app_role, NULL)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin'::app_role;
  END IF;
END $$;