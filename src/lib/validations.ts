import { z } from 'zod';

// Auth validation schemas
export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128, "Password must be less than 128 characters"),
  joinRestaurantId: z.string().uuid("Please select a valid restaurant").optional(),
});

export const signInSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  password: z.string().min(1, "Password is required").max(128, "Password must be less than 128 characters"),
});

export const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "cafe", label: "Café" },
  { value: "bar", label: "Bar" },
  { value: "bakery", label: "Bakery" },
  { value: "retail", label: "Retail / Shop" },
  { value: "salon", label: "Salon / Spa" },
  { value: "gym", label: "Gym / Fitness" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" },
] as const;

export const BUSINESS_TYPE_VALUES = BUSINESS_TYPES.map((b) => b.value) as [string, ...string[]];

export const registerRestaurantSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128, "Password must be less than 128 characters"),
  restaurantName: z.string().trim().min(1, "Business name is required").max(200, "Business name must be less than 200 characters"),
  businessType: z.enum(BUSINESS_TYPE_VALUES, { errorMap: () => ({ message: "Please select a business type" }) }),
});

export const passwordResetSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
});

// Menu item validation schema
export const menuItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(200, "Item name must be less than 200 characters"),
  category: z.string().max(100, "Category must be less than 100 characters").optional().nullable(),
  description: z.string().max(1000, "Description must be less than 1000 characters").optional().nullable(),
  base_price: z.number().positive("Base price must be positive").max(999999.99, "Price too high"),
  per_unit_price: z.number().positive("Per unit price must be positive").max(999999.99, "Price too high").optional().nullable(),
  pricing_unit: z.string().min(1).max(50, "Pricing unit must be less than 50 characters"),
  currency: z.literal("TRY"),
});

// Default payment methods (used as fallback)
export const DEFAULT_PAYMENT_METHODS = ["Cash", "Card"] as const;

// Order validation schemas
export const publicOrderSchema = z.object({
  customerName: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  customerEmail: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters").optional().or(z.literal("")),
  customerPhone: z.string().trim().min(1, "Phone number is required").max(30, "Phone number too long"),
  customerLocation: z.string().trim().min(1, "Location is required").max(300, "Location too long"),
  notes: z.string().max(1000, "Notes must be less than 1000 characters").optional(),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

export const staffOrderSchema = z.object({
  notes: z.string().max(1000, "Notes must be less than 1000 characters").optional(),
  paymentMethod: z.string().min(1, "Payment method is required"),
});

// Validation result type
export type ValidationResult<T> = 
  | { success: true; data: T; error?: never }
  | { success: false; error: string; data?: never };

// Validation helper function
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Return the first error message
  const firstError = result.error.errors[0];
  return { success: false, error: firstError?.message || "Validation failed" };
}
