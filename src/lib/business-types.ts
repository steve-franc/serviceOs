// Business types that are primarily service-oriented.
// Used to default new menu items to "is_service" and tweak labels.
export const SERVICE_BUSINESS_TYPES = new Set<string>([
  "salon",
  "gym",
  "services",
]);

export function isServiceBusiness(businessType?: string | null): boolean {
  if (!businessType) return false;
  return SERVICE_BUSINESS_TYPES.has(businessType);
}

export function menuLabelFor(businessType?: string | null): string {
  return isServiceBusiness(businessType) ? "Services" : "Menu";
}
