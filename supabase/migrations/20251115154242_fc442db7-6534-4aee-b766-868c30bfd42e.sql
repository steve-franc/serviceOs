-- Update the trigger to handle role assignment during signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert role based on user metadata, default to 'user'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id, 
    COALESCE(
      (new.raw_user_meta_data->>'role')::app_role,
      'user'::app_role
    )
  )
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN new;
END;
$$;