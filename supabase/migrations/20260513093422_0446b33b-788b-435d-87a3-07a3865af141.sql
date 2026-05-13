CREATE OR REPLACE FUNCTION public.superadmin_update_broadcast(
  _id uuid,
  _title text,
  _body text,
  _cta_label text,
  _cta_url text,
  _variant text,
  _audience text,
  _restaurant_id uuid,
  _frequency_hours integer,
  _max_shows integer,
  _expires_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.broadcasts SET
    title = _title,
    body = _body,
    cta_label = _cta_label,
    cta_url = _cta_url,
    variant = _variant,
    audience = _audience,
    restaurant_id = CASE WHEN _audience = 'restaurant' THEN _restaurant_id ELSE NULL END,
    frequency_hours = COALESCE(_frequency_hours, 24),
    max_shows = COALESCE(_max_shows, 0),
    expires_at = _expires_at
  WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_update_broadcast(uuid,text,text,text,text,text,text,uuid,integer,integer,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_update_broadcast(uuid,text,text,text,text,text,text,uuid,integer,integer,timestamptz) TO authenticated;