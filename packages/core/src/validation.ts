import { z } from "zod";

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  );

const optionalPhone = z
  .string()
  .trim()
  .max(24)
  .refine(
    (value) => value === "" || /^\+?[0-9][0-9 ().-]{5,22}[0-9]$/.test(value),
    "Enter a valid phone number.",
  );

export const businessProfileSchema = z
  .object({
    legalName: z.string().trim().min(1).max(120),
    displayName: z.string().trim().min(1).max(120),
    address: z.string().trim().max(500),
    phone: optionalPhone,
    email: optionalEmail,
    logoUri: z.string().trim().max(512),
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .refine((value) => {
        try {
          new Intl.NumberFormat("en", { style: "currency", currency: value });
          return true;
        } catch {
          return false;
        }
      }, "Choose a supported currency code."),
    timezone: z
      .string()
      .trim()
      .min(1)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid timezone."),
    invoicePrefix: z.string().trim().min(1).max(16),
    taxEnabled: z.boolean(),
    taxRegistrationId: z.string().trim().max(64),
    allowMultipleBarcodes: z.boolean(),
  })
  .superRefine((profile, context) => {
    if (profile.taxEnabled && profile.taxRegistrationId.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxRegistrationId"],
        message: "A tax registration ID is required when tax mode is enabled.",
      });
    }
  });

export const ownerSetupSchema = z.object({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
});

export const userCreateSchema = ownerSetupSchema.extend({
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const unitSchema = z.object({
  name: z.string().trim().min(1).max(40),
  code: z.string().trim().min(1).max(12),
  quantityPrecision: z.number().int().min(0).max(6),
});

export const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  description: z.string().max(2000),
  taxCategory: z.string().trim().max(64),
  categoryId: z.string().nullable(),
  unitId: z.string().min(1),
  purchasePrice: z.string().trim(),
  sellingPrice: z.string().trim(),
  reorderThreshold: z.string().trim(),
});

export const barcodeSchema = z.object({
  value: z.string().trim().min(1).max(80),
  symbology: z.enum(["CODE128", "EAN13"]),
});

const optionalContactEmail = z
  .string()
  .trim()
  .max(254)
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success,
    "Enter a valid email address.",
  );

const optionalContactPhone = z
  .string()
  .trim()
  .max(24)
  .refine(
    (value) => value === "" || /^\+?[0-9][0-9 ().-]{5,22}[0-9]$/.test(value),
    "Enter a valid phone number.",
  );

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120),
  phone: optionalContactPhone,
  email: optionalContactEmail,
  address: z.string().trim().max(500),
});

export const purchaseSchema = z.object({
  supplierId: z.string().min(1),
  referenceNumber: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().trim().min(8).max(128),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.string().trim().min(1).max(32),
        unitCost: z.string().trim().max(32),
      }),
    )
    .min(1)
    .max(200),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: optionalContactPhone,
  email: optionalContactEmail,
  address: z.string().trim().max(500),
});

export const stockMovementSchema = z.object({
  productId: z.string().min(1),
  movementType: z.enum([
    "OPENING",
    "PURCHASE_IN",
    "MANUAL_IN",
    "MANUAL_OUT",
    "ADJUSTMENT",
    "PURCHASE_RETURN",
  ]),
  quantity: z.string().trim().min(1).max(32),
  unitCost: z.string().trim().max(32).optional(),
  reason: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const taxRateSchema = z.object({
  categoryCode: z.string().trim().min(1).max(64),
  rateBasisPoints: z.number().int().min(0).max(10000),
  effectiveAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(240),
});

export const invoiceDraftSchema = z.object({
  customerId: z.string().nullable(),
  idempotencyKey: z.string().trim().min(8).max(128),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.string().trim().min(1).max(32),
        discount: z.string().trim().max(32).default("0"),
      }),
    )
    .min(1)
    .max(100),
});

export const paymentSchema = z.object({
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CREDIT"]),
  amount: z.string().trim().min(1).max(32),
  reference: z.string().trim().max(128).default(""),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const invoiceReturnSchema = z.object({
  reason: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(8).max(128),
  refund: z.string().trim().max(32).default("0"),
  lines: z
    .array(
      z.object({
        invoiceLineId: z.string().min(1),
        quantity: z.string().trim().min(1).max(32),
        disposition: z.enum(["RESTOCK", "DAMAGED", "QUARANTINE"]),
      }),
    )
    .min(1)
    .max(100),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type OwnerSetupInput = z.infer<typeof ownerSetupSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type BarcodeInput = z.infer<typeof barcodeSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type TaxRateInput = z.infer<typeof taxRateSchema>;
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type InvoiceReturnInput = z.infer<typeof invoiceReturnSchema>;

export type SupplierInput = z.infer<typeof supplierSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;

export const salesReportSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
});
export type SalesReportInput = z.infer<typeof salesReportSchema>;

export const supplierCreditSchema = z.object({
  supplierId: z.string().min(1),
  purchaseId: z.string().min(1),
  reason: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(8).max(128),
  lines: z
    .array(
      z.object({
        purchaseLineId: z.string().min(1),
        quantity: z.string().trim().min(1).max(32),
      }),
    )
    .min(1)
    .max(200),
});
export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  amount: z.string().trim().min(1).max(32),
  method: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]),
  reference: z.string().trim().max(128).default(""),
  idempotencyKey: z.string().trim().min(8).max(128),
});
export const dateRangeSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    groupBy: z.enum(["day", "week", "month"]).optional(),
  })
  .refine((v) => Date.parse(v.from) < Date.parse(v.to), {
    message: "The report end must be after its start.",
  });
export type SupplierCreditInput = z.infer<typeof supplierCreditSchema>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
