
-- 1) Tighten orders INSERT to verify restaurant + allow_public_orders for public path
DROP POLICY IF EXISTS "Public and staff can create orders" ON public.orders;
CREATE POLICY "Public and staff can create orders"
ON public.orders
FOR INSERT
WITH CHECK (
  (
    is_public_order = true
    AND restaurant_id IS NOT NULL
    AND discount_amount = 0::numeric
    AND EXISTS (
      SELECT 1 FROM public.restaurant_settings rs
      WHERE rs.restaurant_id = orders.restaurant_id
        AND rs.allow_public_orders = true
    )
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = orders.restaurant_id
        AND r.status = 'active'
    )
  )
  OR (
    is_public_order = false
    AND auth.uid() = staff_id
    AND restaurant_id = current_restaurant_id(auth.uid())
  )
);

-- 2) Restrict manager role assignment: managers cannot grant manager/superadmin/investor,
--    and target user must already be a member of the manager's restaurant.
DROP POLICY IF EXISTS "Managers can manage roles for their restaurant" ON public.user_roles;

CREATE POLICY "Managers can view roles in their restaurant"
ON public.user_roles
FOR SELECT
USING (is_manager(auth.uid(), restaurant_id));

CREATE POLICY "Managers can assign staff roles in their restaurant"
ON public.user_roles
FOR INSERT
WITH CHECK (
  is_manager(auth.uid(), restaurant_id)
  AND role IN ('server'::app_role, 'ops'::app_role, 'counter'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.restaurant_memberships m
    WHERE m.user_id = user_roles.user_id
      AND m.restaurant_id = user_roles.restaurant_id
  )
);

CREATE POLICY "Managers can update staff roles in their restaurant"
ON public.user_roles
FOR UPDATE
USING (
  is_manager(auth.uid(), restaurant_id)
  AND role IN ('server'::app_role, 'ops'::app_role, 'counter'::app_role)
)
WITH CHECK (
  is_manager(auth.uid(), restaurant_id)
  AND role IN ('server'::app_role, 'ops'::app_role, 'counter'::app_role)
);

CREATE POLICY "Managers can remove staff roles in their restaurant"
ON public.user_roles
FOR DELETE
USING (
  is_manager(auth.uid(), restaurant_id)
  AND role IN ('server'::app_role, 'ops'::app_role, 'counter'::app_role)
);

-- 3) Revoke EXECUTE on SECURITY DEFINER trigger/internal functions from anon and authenticated.
DO $$
DECLARE
  fn text;
  trigger_only text[] := ARRAY[
    'handle_new_restaurant','handle_new_user',
    'handle_restock_insert','handle_restock_delete',
    'sync_inventory_to_menu_item','sync_menu_item_to_inventory',
    'set_order_number','decrement_menu_item_stock',
    'enforce_menu_item_limit','enforce_staff_seat_limit',
    'validate_payment_mode','validate_subscription_status',
    'update_updated_at_column','sync_order_paid_at'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_only LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM anon, authenticated, PUBLIC', fn);
  END LOOP;
END $$;

-- 4) Revoke anon EXECUTE from SECURITY DEFINER functions that are NOT meant to be public.
--    Keep anon for: create_public_order, get_public_receipt, get_public_restaurant_info, get_available_slots
DO $$
DECLARE
  r record;
  keep_anon text[] := ARRAY[
    'create_public_order','get_public_receipt',
    'get_public_restaurant_info','get_available_slots'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname <> ALL(keep_anon)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, PUBLIC', r.proname, r.args);
  END LOOP;
END $$;
