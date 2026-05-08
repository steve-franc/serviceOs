// Single source of truth for every gateable feature in the app.
// Add a new entry here and it instantly appears in the superadmin
// Subscriptions editor as a one-click preset.

export type FeatureKind = "number-or-unlimited" | "boolean" | "text";

export interface FeatureDef {
  key: string;
  label: string;
  kind: FeatureKind;
  group: string;
}

export const FEATURE_CATALOG: FeatureDef[] = [
  // Core ordering
  { key: "staff_orders", label: "Take staff orders", kind: "boolean", group: "Core ordering" },
  { key: "public_ordering", label: "Public / QR ordering", kind: "boolean", group: "Core ordering" },
  { key: "tabs", label: "Running tabs", kind: "boolean", group: "Core ordering" },
  { key: "service_bookings", label: "Service bookings", kind: "boolean", group: "Core ordering" },
  { key: "custom_payment_methods", label: "Custom payment methods", kind: "boolean", group: "Core ordering" },
  { key: "multi_currency", label: "Multiple currencies", kind: "boolean", group: "Core ordering" },
  { key: "order_discounts", label: "Order discounts", kind: "boolean", group: "Core ordering" },
  { key: "edit_orders", label: "Edit orders after creation", kind: "boolean", group: "Core ordering" },

  // Menu & inventory
  { key: "max_menu_items", label: "Max menu items", kind: "number-or-unlimited", group: "Menu & inventory" },
  { key: "max_inventory_items", label: "Max inventory items", kind: "number-or-unlimited", group: "Menu & inventory" },
  { key: "inventory_module", label: "Inventory module", kind: "boolean", group: "Menu & inventory" },
  { key: "menu_images", label: "Menu item images", kind: "boolean", group: "Menu & inventory" },
  { key: "menu_tags", label: "Menu categories / tags", kind: "boolean", group: "Menu & inventory" },
  { key: "internal_menu_items", label: "Internal-only menu items", kind: "boolean", group: "Menu & inventory" },
  { key: "stock_automation", label: "Auto stock decrement", kind: "boolean", group: "Menu & inventory" },
  { key: "menu_sharing", label: "Menu sharing (text export)", kind: "boolean", group: "Menu & inventory" },

  // Team & roles
  { key: "staff_seats", label: "Staff seats", kind: "number-or-unlimited", group: "Team & roles" },
  { key: "role_server", label: "Server role", kind: "boolean", group: "Team & roles" },
  { key: "role_ops", label: "Ops role", kind: "boolean", group: "Team & roles" },
  { key: "role_counter", label: "Counter role", kind: "boolean", group: "Team & roles" },
  { key: "role_investor", label: "Investor (read-only) role", kind: "boolean", group: "Team & roles" },

  // Reports & analytics
  { key: "daily_reports", label: "Daily reports", kind: "boolean", group: "Reports & analytics" },
  { key: "historical_reports", label: "Historical breakdown", kind: "boolean", group: "Reports & analytics" },
  { key: "report_history_days", label: "Report history (days)", kind: "number-or-unlimited", group: "Reports & analytics" },
  { key: "profit_analytics", label: "Profit / margin analytics", kind: "boolean", group: "Reports & analytics" },
  { key: "customer_analytics", label: "Customer analytics", kind: "boolean", group: "Reports & analytics" },
  { key: "category_tagging", label: "Category revenue tagging", kind: "boolean", group: "Reports & analytics" },
  { key: "expense_tracking", label: "Expense tracking", kind: "boolean", group: "Reports & analytics" },
  { key: "debtor_management", label: "Debtor management", kind: "boolean", group: "Reports & analytics" },
  { key: "fixed_expenses", label: "Daily bills / fixed expenses", kind: "boolean", group: "Reports & analytics" },

  // Automation & alerts
  { key: "auto_end_day", label: "Auto end-of-day close", kind: "boolean", group: "Automation & alerts" },
  { key: "alert_low_stock", label: "Low-stock notifications", kind: "boolean", group: "Automation & alerts" },
  { key: "alert_low_margin", label: "Low-margin notifications", kind: "boolean", group: "Automation & alerts" },
  { key: "alert_new_order", label: "New order notifications", kind: "boolean", group: "Automation & alerts" },
  { key: "whatsapp_notifications", label: "WhatsApp notifications", kind: "boolean", group: "Automation & alerts" },

  // Branding & customization
  { key: "custom_logo", label: "Custom restaurant logo", kind: "boolean", group: "Branding" },
  { key: "custom_thresholds", label: "Custom profit-margin thresholds", kind: "boolean", group: "Branding" },
  { key: "custom_timezone", label: "Custom timezone", kind: "boolean", group: "Branding" },

  // Data & history
  { key: "order_history_days", label: "Order history (days)", kind: "number-or-unlimited", group: "Data & history" },
  { key: "receipt_print", label: "Receipt printing", kind: "boolean", group: "Data & history" },
  { key: "receipt_reprint", label: "Receipt re-print from history", kind: "boolean", group: "Data & history" },

  // Volume caps
  { key: "max_orders_per_month", label: "Max orders / month", kind: "number-or-unlimited", group: "Volume caps" },
  { key: "max_public_orders_per_month", label: "Max public orders / month", kind: "number-or-unlimited", group: "Volume caps" },
  { key: "max_open_tabs", label: "Max open tabs at once", kind: "number-or-unlimited", group: "Volume caps" },
  { key: "max_active_bookings", label: "Max active bookings", kind: "number-or-unlimited", group: "Volume caps" },
];

export const FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.label])
);

export const FEATURE_KIND: Record<string, FeatureKind> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.kind])
);
