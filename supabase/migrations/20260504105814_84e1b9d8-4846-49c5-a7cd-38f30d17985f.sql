CREATE OR REPLACE FUNCTION public.validate_subscription_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.subscription_status NOT IN ('free','active','past_due','cancelled') THEN
    RAISE EXCEPTION 'Invalid subscription_status: %', NEW.subscription_status;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_payment_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.payment_mode NOT IN ('test','live') THEN
    RAISE EXCEPTION 'payment_mode must be test or live';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;