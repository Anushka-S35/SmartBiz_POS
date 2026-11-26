import { z } from "zod";
import { hasValidGstinStructure } from "./gst";

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
    taxRegistrationId: z
      .string()
      .trim()
      .max(15)
      .transform((value) => value.toUpperCase()),
    gstRegistrationType: z.enum([
      "NOT_CONFIGURED",
      "REGULAR",
      "COMPOSITION",
      "UNREGISTERED",
    ]),
    gstTradeName: z.string().trim().max(120),
    gstStateCode: z
      .string()
      .trim()
      .regex(/^(?:|\d{2})$/),
    gstRegisteredAddress: z.string().trim().max(500),
    gstFinancialYearStartMonth: z.number().int().min(1).max(12),
    gstInvoicePrefix: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9/-]{1,4}$/),
    gstInvoiceFooter: z.string().trim().max(500),
    allowMultipleBarcodes: z.boolean(),
  })
  .superRefine((profile, context) => {
    const requiresGstin =
      profile.gstRegistrationType === "REGULAR" ||
      profile.gstRegistrationType === "COMPOSITION";
    if (requiresGstin && !hasValidGstinStructure(profile.taxRegistrationId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxRegistrationId"],
        message:
          "Enter a structurally valid GSTIN for the selected registration type.",
      });
    }
    if (requiresGstin && !/^\d{2}$/.test(profile.gstStateCode))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gstStateCode"],
        message: "Enter the two-digit state code for this GST registration.",
      });
    if (requiresGstin && profile.gstRegisteredAddress.length === 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gstRegisteredAddress"],
        message: "Enter the address recorded for this GST registration.",
      });
    if (profile.gstRegistrationType === "UNREGISTERED") {
      if (profile.taxEnabled)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["taxEnabled"],
          message:
            "Tax calculation cannot be enabled for an unregistered business.",
        });
      if (profile.taxRegistrationId)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["taxRegistrationId"],
          message: "Clear the GSTIN when the business is unregistered.",
        });
    }
    if (profile.taxEnabled && profile.gstRegistrationType !== "REGULAR")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxEnabled"],
        message:
          "This POS applies configured GST rates only for regular registrations.",
      });
    if (profile.taxEnabled && profile.gstRegistrationType === "NOT_CONFIGURED")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gstRegistrationType"],
        message:
          "Configure the GST registration type before enabling tax calculation.",
      });
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
  hsnSacCode: z
    .string()
    .trim()
    .max(8)
    .refine(
      (value) => value === "" || /^(?:\d{4}|\d{6}|\d{8})$/.test(value),
      "Enter a 4, 6, or 8 digit HSN/SAC code.",
    )
    .optional(),
  gstSupplyType: z
    .enum(["TAXABLE", "EXEMPT", "NIL_RATED", "NON_GST"])
    .optional(),
  gstPricingMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]).optional(),
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
  supplierInvoiceNumber: z.string().trim().max(80).optional(),
  supplierInvoiceDate: z.string().trim().max(32).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
  reverseCharge: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.string().trim().min(1).max(32),
        unitCost: z.string().trim().max(32),
        hsnSacCode: z.string().trim().max(8).optional(),
        gstSupplyType: z
          .enum(["TAXABLE", "EXEMPT", "NIL_RATED", "NON_GST"])
          .optional(),
        gstPricingMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]).optional(),
        gstRateBasisPoints: z
          .number()
          .int()
          .min(0)
          .max(1000000)
          .optional(),
        cessRateBasisPoints: z
          .number()
          .int()
          .min(0)
          .max(1000000)
          .optional(),
        discountMinor: z
          .number()
          .int()
          .min(0)
          .optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const purchaseItcAdjustmentSchema = z.object({
  purchaseId: z.string().min(1),
  purchaseLineId: z.string().min(1),
  adjustmentType: z.enum(["CLAIM", "REVERSAL", "RECLAIM"]),
  cgstMinor: z.number().int().min(0),
  sgstMinor: z.number().int().min(0),
  igstMinor: z.number().int().min(0),
  cessMinor: z.number().int().min(0),
  reason: z.string().trim().min(1).max(240),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const gstRegisterSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  scope: z.enum(["SALES", "PURCHASES"]),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type PurchaseItcAdjustmentInput = z.infer<
  typeof purchaseItcAdjustmentSchema
>;
export type GstRegisterInput = z.infer<typeof gstRegisterSchema>;

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: optionalContactPhone,
  email: optionalContactEmail,
  address: z.string().trim().max(500),
  gstin: z.string().trim().max(15).transform((value) => value.toUpperCase()).optional(),
  stateCode: z.string().trim().regex(/^(?:|\d{2})$/).optional(),
}).superRefine((customer, context) => {
  if (customer.gstin && !hasValidGstinStructure(customer.gstin))
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gstin"],
      message: "Enter a structurally valid GSTIN. GSTN status is not checked.",
    });
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
  cessRateBasisPoints: z.number().int().min(0).max(1000000).default(0),
  effectiveAt: z.string().datetime(),
  sourceReference: z.string().trim().min(1).max(240),
  reason: z.string().trim().min(1).max(240),
});

export const invoiceDraftSchema = z.object({
  customerId: z.string().nullable(),
  placeOfSupplyStateCode: z.string().trim().regex(/^(?:|\d{2})$/).optional(),
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
