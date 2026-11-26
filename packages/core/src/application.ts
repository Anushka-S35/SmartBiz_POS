import Papa from "papaparse";
import { restoreCsvValue, safeCsvRows } from "./csv";
import { AppError, isConstraintError, persistenceConflict } from "./errors";
import { validateBarcode, generateInternalBarcode } from "./barcode";
import { hashPassword, verifyPassword, PASSWORD_ITERATIONS } from "./password";
import { assertPermission, type Permission } from "./permissions";
import {
  businessProfileSchema,
  ownerSetupSchema,
  userCreateSchema,
  categorySchema,
  unitSchema,
  productSchema,
  barcodeSchema,
  customerSchema,
  supplierSchema,
  purchaseSchema,
  salesReportSchema,
  supplierCreditSchema,
  supplierPaymentSchema,
  purchaseItcAdjustmentSchema,
  gstRegisterSchema,
  dateRangeSchema,
  stockMovementSchema,
  taxRateSchema,
  invoiceDraftSchema,
  paymentSchema,
  invoiceReturnSchema,
  type BusinessProfileInput,
  type OwnerSetupInput,
  type UserCreateInput,
  type CategoryInput,
  type UnitInput,
  type ProductInput,
  type BarcodeInput,
  type CustomerInput,
  type SupplierInput,
  type PurchaseInput,
  type PurchaseItcAdjustmentInput,
  type GstRegisterInput,
  type SalesReportInput,
  type SupplierCreditInput,
  type SupplierPaymentInput,
  type DateRangeInput,
  type StockMovementInput,
  type TaxRateInput,
  type InvoiceDraftInput,
  type PaymentInput,
  type InvoiceReturnInput,
} from "./validation";
import {
  getCurrencyFractionDigits,
  parseMoneyToMinorUnits,
  parseQuantityToScaledInteger,
  minorUnitsToDecimal,
} from "./money";
import type {
  Actor,
  BarcodeHistoryRecord,
  BarcodeSymbology,
  BusinessProfile,
  CategoryRecord,
  ProductRecord,
  Runtime,
  SqlDatabase,
  UnitRecord,
  UserRecord,
  UserRole,
  Locale,
  CustomerRecord,
  SupplierRecord,
  PurchaseRecord,
  SalesReport,
  SupplierCreditRecord,
  SupplierBalanceRecord,
  SupplierPaymentRecord,
  PurchaseReport,
  InventoryValuation,
  CustomerSalesSummary,
  StockBalanceRecord,
  StockMovementRecord,
  InvoiceRecord,
  InvoiceLineRecord,
  PaymentRecord,
  TaxRateRecord,
  ItcClassification,
  ItcAdjustmentType,
  PurchaseItcAdjustmentRecord,
  GstRegisterLine,
  GstRegister,
  GstTaxSummary,
  GstItcSummary,
  GstNetLiabilitySummary,
} from "./models";
import { isLocale } from "./i18n";
import { calculateGstLine, hasValidGstinStructure, hasValidHsnSacStructure } from "./gst";

interface BusinessRow {
  id: string;
  legal_name: string;
  display_name: string;
  address: string;
  phone: string;
  email: string;
  logo_uri: string | null;
  currency_code: string;
  currency_fraction_digits: number;
  timezone: string;
  invoice_prefix: string;
  tax_enabled: number;
  tax_registration_id: string | null;
  gst_registration_type: BusinessProfile["gstRegistrationType"];
  gst_trade_name: string;
  gst_state_code: string;
  gst_registered_address: string;
  gst_financial_year_start_month: number;
  gst_invoice_prefix: string;
  gst_invoice_footer: string;
  allow_multiple_barcodes: number;
  setup_complete: number;
}

interface UserRow {
  id: string;
  business_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  disabled_at: string | null;
}

interface CategoryRow {
  id: string;
  business_id: string;
  name: string;
  archived_at: string | null;
}

interface UnitRow {
  id: string;
  business_id: string;
  name: string;
  code: string;
  quantity_precision: number;
  archived_at: string | null;
}

interface ProductRow {
  id: string;
  business_id: string;
  name: string;
  sku: string;
  description: string;
  tax_category: string;
  hsn_sac_code: string;
  gst_supply_type: ProductRecord["gstSupplyType"];
  gst_pricing_mode: ProductRecord["gstPricingMode"];
  category_id: string | null;
  category_name_snapshot: string;
  unit_id: string;
  unit_name_snapshot: string;
  unit_precision_snapshot: number;
  purchase_price_minor: number;
  selling_price_minor: number;
  reorder_threshold_scaled: number;
  is_active: number;
  archived_at: string | null;
  version: number;
  active_barcode: string | null;
  active_barcode_symbology: BarcodeSymbology | null;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  state_code: string;
  archived_at: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  status: InvoiceRecord["status"];
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  total_minor: number;
  paid_minor: number;
  created_at: string;
  posted_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  gst_document_type: InvoiceRecord["documentType"];
  customer_gstin_snapshot: string;
  customer_address_snapshot: string;
  customer_state_code_snapshot: string;
  supplier_gstin_snapshot: string;
  supplier_legal_name_snapshot: string;
  supplier_trade_name_snapshot: string;
  supplier_address_snapshot: string;
  supplier_state_code_snapshot: string;
  place_of_supply_state_code: string;
  reverse_charge: number;
  financial_year_snapshot: string;
}

export interface SetupState {
  businessExists: boolean;
  setupComplete: boolean;
}

export interface ProductListOptions {
  search?: string;
  categoryId?: string;
  includeArchived?: boolean;
  offset?: number;
  limit?: number;
}

export interface CsvPreviewRow {
  rowNumber: number;
  product: ProductInput | null;
  error: string | null;
}

export interface CsvImportResult {
  importedCount: number;
  errors: Array<{ rowNumber: number; message: string }>;
}

function mapBusiness(row: BusinessRow): BusinessProfile {
  return {
    id: row.id,
    legalName: row.legal_name,
    displayName: row.display_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    logoUri: row.logo_uri,
    currencyCode: row.currency_code,
    currencyFractionDigits: row.currency_fraction_digits,
    timezone: row.timezone,
    invoicePrefix: row.invoice_prefix,
    taxEnabled: row.tax_enabled === 1,
    taxRegistrationId: row.tax_registration_id,
    gstRegistrationType: row.gst_registration_type,
    gstTradeName: row.gst_trade_name,
    gstStateCode: row.gst_state_code,
    gstRegisteredAddress: row.gst_registered_address,
    gstFinancialYearStartMonth: row.gst_financial_year_start_month,
    gstInvoicePrefix: row.gst_invoice_prefix,
    gstInvoiceFooter: row.gst_invoice_footer,
    allowMultipleBarcodes: row.allow_multiple_barcodes === 1,
    setupComplete: row.setup_complete === 1,
  };
}

function mapUser(
  row: Pick<
    UserRow,
    "id" | "business_id" | "email" | "display_name" | "role" | "disabled_at"
  >,
): UserRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    disabledAt: row.disabled_at,
  };
}

function mapCategory(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    archivedAt: row.archived_at,
  };
}

function mapUnit(row: UnitRow): UnitRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    code: row.code,
    quantityPrecision: row.quantity_precision,
    archivedAt: row.archived_at,
  };
}

function mapProduct(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    taxCategory: row.tax_category,
    hsnSacCode: row.hsn_sac_code,
    gstSupplyType: row.gst_supply_type,
    gstPricingMode: row.gst_pricing_mode,
    categoryId: row.category_id,
    categoryName: row.category_name_snapshot,
    unitId: row.unit_id,
    unitName: row.unit_name_snapshot,
    unitPrecision: row.unit_precision_snapshot,
    purchasePriceMinor: row.purchase_price_minor,
    sellingPriceMinor: row.selling_price_minor,
    reorderThresholdScaled: row.reorder_threshold_scaled,
    isActive: row.is_active === 1,
    archivedAt: row.archived_at,
    version: row.version,
    activeBarcode: row.active_barcode,
    activeBarcodeSymbology: row.active_barcode_symbology,
  };
}

function normalized(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

function financialYearLabel(
  timestamp: string,
  timezone: string,
  startMonth: number,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(timestamp));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function roundedProduct(
  amount: number,
  numerator: number,
  denominator: number,
): number {
  const result =
    (BigInt(amount) * BigInt(numerator) + BigInt(denominator) / 2n) /
    BigInt(denominator);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError("VALIDATION", "The calculated amount is too large.");
  }
  return Number(result);
}

function groupPeriod(
  timestamp: string,
  groupBy: "day" | "week" | "month",
  timezone: string,
): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year),
    month = Number(parts.month),
    day = Number(parts.day);
  if (groupBy === "month")
    return String(parts.year) + "-" + String(parts.month);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  if (groupBy === "week") {
    const weekday = localDate.getUTCDay() || 7;
    localDate.setUTCDate(localDate.getUTCDate() - weekday + 1);
  }
  return localDate.toISOString().slice(0, 10);
}

function mapCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    gstin: row.gstin,
    stateCode: row.state_code,
    archivedAt: row.archived_at,
  };
}

function mapInvoice(
  row: InvoiceRow,
  lines: InvoiceLineRecord[],
  payments: PaymentRecord[],
): InvoiceRecord {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerGstinSnapshot: row.customer_gstin_snapshot,
    customerAddressSnapshot: row.customer_address_snapshot,
    customerStateCodeSnapshot: row.customer_state_code_snapshot,
    documentType: row.gst_document_type,
    supplierGstinSnapshot: row.supplier_gstin_snapshot,
    supplierLegalNameSnapshot: row.supplier_legal_name_snapshot,
    supplierTradeNameSnapshot: row.supplier_trade_name_snapshot,
    supplierAddressSnapshot: row.supplier_address_snapshot,
    supplierStateCodeSnapshot: row.supplier_state_code_snapshot,
    placeOfSupplyStateCode: row.place_of_supply_state_code,
    reverseCharge: row.reverse_charge === 1,
    financialYear: row.financial_year_snapshot,
    status: row.status,
    subtotalMinor: row.subtotal_minor,
    discountMinor: row.discount_minor,
    taxMinor: row.tax_minor,
    totalMinor: row.total_minor,
    paidMinor: row.paid_minor,
    dueMinor:
      row.status === "CANCELLED"
        ? 0
        : Math.max(0, row.total_minor - row.paid_minor),
    createdAt: row.created_at,
    postedAt: row.posted_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    lines,
    payments,
  };
}

function validationResult<T>(
  schema: {
    safeParse(value: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: Array<{ message: string; path: PropertyKey[] }> };
        };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError(
      "VALIDATION",
      issue?.message ?? "The provided data is invalid.",
      String(issue?.path[0] ?? ""),
    );
  }
  return parsed.data;
}

function validRole(value: string): value is UserRole {
  return value === "ADMIN" || value === "MANAGER" || value === "CASHIER";
}

export class SmartBizApplication {
  private readonly failedLoginAttempts = new Map<
    string,
    { count: number; lockedUntil: number }
  >();
  private activeSession: { userId: string; expiresAt: number } | null = null;

  constructor(
    private readonly database: SqlDatabase,
    private readonly runtime: Runtime,
    private readonly sessionTtlMinutes = 30,
  ) {
    if (
      !Number.isInteger(sessionTtlMinutes) ||
      sessionTtlMinutes < 5 ||
      sessionTtlMinutes > 720
    ) {
      throw new AppError(
        "VALIDATION",
        "Session expiry must be between 5 and 720 minutes.",
      );
    }
  }

  async getSetupState(): Promise<SetupState> {
    const row = await this.database.query<
      Pick<BusinessRow, "id" | "setup_complete">
    >("SELECT id, setup_complete FROM businesses LIMIT 1");
    return {
      businessExists: row.length > 0,
      setupComplete: row[0]?.setup_complete === 1,
    };
  }

  async getLocale(): Promise<Locale> {
    const rows = await this.database.query<{ value: string }>(
      "SELECT value FROM app_preferences WHERE key = 'locale'",
    );
    const value = rows[0]?.value ?? "en";
    return isLocale(value) ? value : "en";
  }

  async setLocale(locale: Locale): Promise<void> {
    if (!isLocale(locale))
      throw new AppError("VALIDATION", "Choose a supported language.");
    await this.database.execute(
      `INSERT INTO app_preferences (key, value, updated_at) VALUES ('locale', $1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [locale, this.runtime.now()],
    );
  }

  async setupBusiness(
    profileValue: BusinessProfileInput,
    ownerValue: OwnerSetupInput,
  ): Promise<UserRecord> {
    const profile = validationResult(businessProfileSchema, profileValue);
    const owner = validationResult(ownerSetupSchema, ownerValue);
    const existing = await this.database.query<{ id: string }>(
      "SELECT id FROM businesses LIMIT 1",
    );
    if (existing.length > 0) {
      throw new AppError(
        "CONFLICT",
        "A business profile already exists on this installation.",
      );
    }

    const password = await hashPassword(
      owner.password,
      this.runtime.randomBytes,
    );
    const businessId = this.runtime.createId();
    const now = this.runtime.now();
    const currencyFractionDigits = getCurrencyFractionDigits(
      profile.currencyCode,
    );

    try {
      await this.database.execute(
        `INSERT INTO businesses (
          id, legal_name, display_name, address, phone, email, logo_uri, currency_code,
          currency_fraction_digits, timezone, invoice_prefix, tax_enabled, tax_registration_id,
          allow_multiple_barcodes, created_at, updated_at, gst_registration_type, gst_trade_name,
          gst_state_code, gst_registered_address
          ,gst_financial_year_start_month,gst_invoice_prefix,gst_invoice_footer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          businessId,
          profile.legalName,
          profile.displayName,
          profile.address,
          profile.phone,
          profile.email,
          profile.logoUri || null,
          profile.currencyCode,
          currencyFractionDigits,
          profile.timezone,
          profile.invoicePrefix,
          profile.taxEnabled ? 1 : 0,
          profile.taxRegistrationId || null,
          profile.allowMultipleBarcodes ? 1 : 0,
          now,
          profile.gstRegistrationType,
          profile.gstTradeName,
          profile.gstStateCode,
          profile.gstRegisteredAddress,
          profile.gstFinancialYearStartMonth,
          profile.gstInvoicePrefix,
          profile.gstInvoiceFooter,
        ],
      );
      await this.database.execute(
        `INSERT INTO users (
          id, business_id, email, normalized_email, display_name, role, password_hash,
          password_salt, password_iterations, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'ADMIN', $6, $7, $8, $9, $9)`,
        [
          this.runtime.createId(),
          businessId,
          owner.email.trim(),
          normalized(owner.email),
          owner.displayName.trim(),
          password.hash,
          password.salt,
          password.iterations,
          now,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }

    const user = await this.database.query<UserRow>(
      `SELECT id, business_id, email, display_name, role, password_hash, password_salt,
        password_iterations, disabled_at
       FROM users WHERE business_id = $1 AND normalized_email = $2`,
      [businessId, normalized(owner.email)],
    );
    const created = user[0];
    if (!created)
      throw new AppError(
        "PERSISTENCE",
        "The owner account could not be read after setup.",
      );
    const mapped = mapUser(created);
    this.startSession(mapped.id);
    return mapped;
  }

  async completeOwnerSetup(ownerValue: OwnerSetupInput): Promise<UserRecord> {
    const owner = validationResult(ownerSetupSchema, ownerValue);
    const businessRows = await this.database.query<{
      id: string;
      setup_complete: number;
    }>("SELECT id, setup_complete FROM businesses LIMIT 1");
    const business = businessRows[0];
    if (!business || business.setup_complete === 1) {
      throw new AppError(
        "CONFLICT",
        "The owner setup is not awaiting completion.",
      );
    }
    const users = await this.database.query<{ id: string }>(
      "SELECT id FROM users WHERE business_id = $1 LIMIT 1",
      [business.id],
    );
    if (users.length > 0)
      throw new AppError(
        "CONFLICT",
        "An account already exists for this setup.",
      );

    const password = await hashPassword(
      owner.password,
      this.runtime.randomBytes,
    );
    const userId = this.runtime.createId();
    const now = this.runtime.now();
    try {
      await this.database.execute(
        `INSERT INTO users (
          id, business_id, email, normalized_email, display_name, role, password_hash,
          password_salt, password_iterations, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'ADMIN', $6, $7, $8, $9, $9)`,
        [
          userId,
          business.id,
          owner.email.trim(),
          normalized(owner.email),
          owner.displayName.trim(),
          password.hash,
          password.salt,
          password.iterations,
          now,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
    const created: UserRecord = {
      id: userId,
      businessId: business.id,
      email: owner.email.trim(),
      displayName: owner.displayName.trim(),
      role: "ADMIN",
      disabledAt: null,
    };
    this.startSession(created.id);
    return created;
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ user: UserRecord; expiresAt: string }> {
    this.logout();
    const normalizedEmail = normalized(email);
    const attempt = this.failedLoginAttempts.get(normalizedEmail);
    if (attempt && attempt.lockedUntil > Date.now()) {
      throw new AppError(
        "UNAUTHENTICATED",
        "Email or password is incorrect. Try again later.",
      );
    }

    const rows = await this.database.query<UserRow>(
      `SELECT u.id, u.business_id, u.email, u.display_name, u.role, u.password_hash,
        u.password_salt, u.password_iterations, u.disabled_at
       FROM users u JOIN businesses b ON b.id = u.business_id
       WHERE u.normalized_email = $1 AND b.setup_complete = 1
       LIMIT 1`,
      [normalizedEmail],
    );
    const user = rows[0];
    const valid = user
      ? await verifyPassword(
          password,
          user.password_hash,
          user.password_salt,
          user.password_iterations,
        )
      : await verifyPassword(
          password,
          "0".repeat(64),
          "1".repeat(32),
          PASSWORD_ITERATIONS,
        );
    if (!user || !valid || user.disabled_at || !validRole(user.role)) {
      const current = this.failedLoginAttempts.get(normalizedEmail) ?? {
        count: 0,
        lockedUntil: 0,
      };
      const count = current.count + 1;
      this.failedLoginAttempts.set(normalizedEmail, {
        count: count >= 5 ? 0 : count,
        lockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
      });
      throw new AppError("UNAUTHENTICATED", "Email or password is incorrect.");
    }

    this.failedLoginAttempts.delete(normalizedEmail);
    const expiresAt = new Date(
      Date.now() + this.sessionTtlMinutes * 60_000,
    ).toISOString();
    this.activeSession = {
      userId: user.id,
      expiresAt: Date.parse(expiresAt),
    };
    return { user: mapUser(user), expiresAt };
  }

  async refreshSession(userId: string, expiresAt: string): Promise<UserRecord> {
    if (
      !this.activeSession ||
      this.activeSession.userId !== userId ||
      this.activeSession.expiresAt !== Date.parse(expiresAt) ||
      this.activeSession.expiresAt <= Date.now()
    ) {
      throw new AppError(
        "UNAUTHENTICATED",
        "Your session expired. Sign in again.",
      );
    }
    const rows = await this.database.query<UserRow>(
      `SELECT id, business_id, email, display_name, role, password_hash, password_salt,
        password_iterations, disabled_at
       FROM users WHERE id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user || user.disabled_at || !validRole(user.role)) {
      this.logout();
      throw new AppError(
        "UNAUTHENTICATED",
        "Your account is unavailable. Sign in again.",
      );
    }
    return mapUser(user);
  }

  logout(): void {
    this.activeSession = null;
  }

  async getBusiness(actorId: string): Promise<BusinessProfile> {
    const actor = await this.authorize(actorId, "business.read");
    const rows = await this.database.query<BusinessRow>(
      "SELECT * FROM businesses WHERE id = $1",
      [actor.businessId],
    );
    if (!rows[0])
      throw new AppError("NOT_FOUND", "Business profile not found.");
    return mapBusiness(rows[0]);
  }

  async getBillingCurrency(actorId: string): Promise<{
    currencyCode: string;
    currencyFractionDigits: number;
    taxEnabled: boolean;
    businessName: string;
    businessAddress: string;
    businessPhone: string;
    gstRegistrationType: BusinessProfile["gstRegistrationType"];
    gstin: string;
    gstTradeName: string;
    gstRegisteredAddress: string;
    gstStateCode: string;
    gstInvoiceFooter: string;
    gstInvoicePrefix: string;
    gstFinancialYearStartMonth: number;
  }> {
    const actor = await this.authorize(actorId, "billing.read");
    const rows = await this.database.query<{
      currency_code: string;
      currency_fraction_digits: number;
      tax_enabled: number;
      display_name: string;
      address: string;
      phone: string;
      gst_registration_type: BusinessProfile["gstRegistrationType"];
      tax_registration_id: string | null;
      gst_trade_name: string;
      gst_registered_address: string;
      gst_state_code: string;
      gst_invoice_footer: string;
      gst_invoice_prefix: string;
      gst_financial_year_start_month: number;
    }>(
      `SELECT currency_code,currency_fraction_digits,tax_enabled,display_name,address,phone,
        gst_registration_type,tax_registration_id,gst_trade_name,gst_registered_address,
        gst_state_code,gst_invoice_footer,gst_invoice_prefix,gst_financial_year_start_month
       FROM businesses WHERE id = $1`,
      [actor.businessId],
    );
    if (!rows[0])
      throw new AppError("NOT_FOUND", "Business profile not found.");
    return {
      currencyCode: rows[0].currency_code,
      currencyFractionDigits: rows[0].currency_fraction_digits,
      taxEnabled: rows[0].tax_enabled === 1,
      businessName: rows[0].display_name,
      businessAddress: rows[0].address,
      businessPhone: rows[0].phone,
      gstRegistrationType: rows[0].gst_registration_type,
      gstin: rows[0].tax_registration_id ?? "",
      gstTradeName: rows[0].gst_trade_name,
      gstRegisteredAddress: rows[0].gst_registered_address,
      gstStateCode: rows[0].gst_state_code,
      gstInvoiceFooter: rows[0].gst_invoice_footer,
      gstInvoicePrefix: rows[0].gst_invoice_prefix,
      gstFinancialYearStartMonth: rows[0].gst_financial_year_start_month,
    };
  }

  async updateBusiness(
    actorId: string,
    value: BusinessProfileInput,
  ): Promise<BusinessProfile> {
    const actor = await this.authorize(actorId, "business.update");
    const profile = validationResult(businessProfileSchema, value);
    const fractionDigits = getCurrencyFractionDigits(profile.currencyCode);
    await this.database.execute(
      `UPDATE businesses SET legal_name = $1, display_name = $2, address = $3, phone = $4,
        email = $5, logo_uri = $6, currency_code = $7, currency_fraction_digits = $8,
        timezone = $9, invoice_prefix = $10, tax_enabled = $11, tax_registration_id = $12,
        allow_multiple_barcodes = $13, updated_at = $14, updated_by = $15,
        gst_registration_type = $16, gst_trade_name = $17, gst_state_code = $18,
        gst_registered_address = $19
        ,gst_financial_year_start_month = $20,gst_invoice_prefix = $21,gst_invoice_footer = $22
       WHERE id = $23`,
      [
        profile.legalName,
        profile.displayName,
        profile.address,
        profile.phone,
        profile.email,
        profile.logoUri || null,
        profile.currencyCode,
        fractionDigits,
        profile.timezone,
        profile.invoicePrefix,
        profile.taxEnabled ? 1 : 0,
        profile.taxRegistrationId || null,
        profile.allowMultipleBarcodes ? 1 : 0,
        this.runtime.now(),
        actor.id,
        profile.gstRegistrationType,
        profile.gstTradeName,
        profile.gstStateCode,
        profile.gstRegisteredAddress,
        profile.gstFinancialYearStartMonth,
        profile.gstInvoicePrefix,
        profile.gstInvoiceFooter,
        actor.businessId,
      ],
    );
    return this.getBusiness(actor.id);
  }

  async listUsers(actorId: string): Promise<UserRecord[]> {
    const actor = await this.authorize(actorId, "users.read");
    const rows = await this.database.query<UserRow>(
      `SELECT id, business_id, email, display_name, role, password_hash, password_salt,
        password_iterations, disabled_at
       FROM users WHERE business_id = $1 ORDER BY display_name COLLATE NOCASE`,
      [actor.businessId],
    );
    return rows.map(mapUser);
  }

  async createUser(
    actorId: string,
    value: UserCreateInput,
  ): Promise<UserRecord> {
    const actor = await this.authorize(actorId, "users.manage");
    const input = validationResult(userCreateSchema, value);
    const password = await hashPassword(
      input.password,
      this.runtime.randomBytes,
    );
    const id = this.runtime.createId();
    const now = this.runtime.now();
    try {
      await this.database.execute(
        `INSERT INTO users (
          id, business_id, email, normalized_email, display_name, role, password_hash,
          password_salt, password_iterations, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [
          id,
          actor.businessId,
          input.email.trim(),
          normalized(input.email),
          input.displayName.trim(),
          input.role,
          password.hash,
          password.salt,
          password.iterations,
          actor.id,
          now,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) {
        throw new AppError(
          "CONFLICT",
          "A user with this email already exists in the business.",
          "email",
        );
      }
      throw error;
    }
    return {
      id,
      businessId: actor.businessId,
      email: input.email.trim(),
      displayName: input.displayName.trim(),
      role: input.role,
      disabledAt: null,
    };
  }

  async updateUserRole(
    actorId: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "users.manage");
    if (!validRole(role))
      throw new AppError("VALIDATION", "Choose a valid user role.", "role");
    try {
      const result = await this.database.execute(
        `UPDATE users SET role = $1, updated_at = $2, updated_by = $3
         WHERE id = $4 AND business_id = $5`,
        [role, this.runtime.now(), actor.id, userId, actor.businessId],
      );
      if (result.changes === 0)
        throw new AppError("NOT_FOUND", "User not found.");
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
  }

  async setUserDisabled(
    actorId: string,
    userId: string,
    disabled: boolean,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "users.manage");
    const now = this.runtime.now();
    try {
      const result = await this.database.execute(
        `UPDATE users SET disabled_at = $1, updated_at = $2, updated_by = $3
         WHERE id = $4 AND business_id = $5`,
        [disabled ? now : null, now, actor.id, userId, actor.businessId],
      );
      if (result.changes === 0)
        throw new AppError("NOT_FOUND", "User not found.");
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
  }

  async listCategories(
    actorId: string,
    includeArchived = false,
  ): Promise<CategoryRecord[]> {
    const actor = await this.authorize(actorId, "products.read");
    const rows = await this.database.query<CategoryRow>(
      `SELECT id, business_id, name, archived_at FROM categories
       WHERE business_id = $1 AND ($2 = 1 OR archived_at IS NULL)
       ORDER BY name COLLATE NOCASE`,
      [actor.businessId, includeArchived ? 1 : 0],
    );
    return rows.map(mapCategory);
  }

  async saveCategory(
    actorId: string,
    value: CategoryInput,
    categoryId?: string,
  ): Promise<CategoryRecord> {
    const actor = await this.authorize(actorId, "categories.manage");
    const input = validationResult(categorySchema, value);
    const id = categoryId ?? this.runtime.createId();
    try {
      if (categoryId) {
        const result = await this.database.execute(
          `UPDATE categories SET name = $1, normalized_name = $2, updated_at = $3
           WHERE id = $4 AND business_id = $5`,
          [
            input.name,
            normalized(input.name),
            this.runtime.now(),
            id,
            actor.businessId,
          ],
        );
        if (result.changes === 0)
          throw new AppError("NOT_FOUND", "Category not found.");
      } else {
        const now = this.runtime.now();
        await this.database.execute(
          `INSERT INTO categories (id, business_id, name, normalized_name, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)`,
          [id, actor.businessId, input.name, normalized(input.name), now],
        );
      }
    } catch (error) {
      if (isConstraintError(error))
        throw new AppError(
          "CONFLICT",
          "A category with this name already exists.",
          "name",
        );
      throw error;
    }
    return {
      id,
      businessId: actor.businessId,
      name: input.name,
      archivedAt: null,
    };
  }

  async setCategoryArchived(
    actorId: string,
    categoryId: string,
    archived: boolean,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "categories.manage");
    const result = await this.database.execute(
      `UPDATE categories SET archived_at = $1, updated_at = $2
       WHERE id = $3 AND business_id = $4`,
      [
        archived ? this.runtime.now() : null,
        this.runtime.now(),
        categoryId,
        actor.businessId,
      ],
    );
    if (result.changes === 0)
      throw new AppError("NOT_FOUND", "Category not found.");
  }

  async listUnits(
    actorId: string,
    includeArchived = false,
  ): Promise<UnitRecord[]> {
    const actor = await this.authorize(actorId, "products.read");
    const rows = await this.database.query<UnitRow>(
      `SELECT id, business_id, name, code, quantity_precision, archived_at FROM units
       WHERE business_id = $1 AND ($2 = 1 OR archived_at IS NULL)
       ORDER BY name COLLATE NOCASE`,
      [actor.businessId, includeArchived ? 1 : 0],
    );
    return rows.map(mapUnit);
  }

  async saveUnit(
    actorId: string,
    value: UnitInput,
    unitId?: string,
  ): Promise<UnitRecord> {
    const actor = await this.authorize(actorId, "units.manage");
    const input = validationResult(unitSchema, value);
    const id = unitId ?? this.runtime.createId();
    const code = normalized(input.code);
    const now = this.runtime.now();
    try {
      if (unitId) {
        const result = await this.database.execute(
          `UPDATE units SET name = $1, code = $2, quantity_precision = $3, updated_at = $4
           WHERE id = $5 AND business_id = $6`,
          [
            input.name,
            code,
            input.quantityPrecision,
            now,
            id,
            actor.businessId,
          ],
        );
        if (result.changes === 0)
          throw new AppError("NOT_FOUND", "Unit not found.");
      } else {
        await this.database.execute(
          `INSERT INTO units (id, business_id, name, code, quantity_precision, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)`,
          [
            id,
            actor.businessId,
            input.name,
            code,
            input.quantityPrecision,
            now,
          ],
        );
      }
    } catch (error) {
      if (isConstraintError(error))
        throw new AppError(
          "CONFLICT",
          "A unit with this code already exists.",
          "code",
        );
      throw error;
    }
    return {
      id,
      businessId: actor.businessId,
      name: input.name,
      code,
      quantityPrecision: input.quantityPrecision,
      archivedAt: null,
    };
  }

  async setUnitArchived(
    actorId: string,
    unitId: string,
    archived: boolean,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "units.manage");
    const result = await this.database.execute(
      `UPDATE units SET archived_at = $1, updated_at = $2
       WHERE id = $3 AND business_id = $4`,
      [
        archived ? this.runtime.now() : null,
        this.runtime.now(),
        unitId,
        actor.businessId,
      ],
    );
    if (result.changes === 0)
      throw new AppError("NOT_FOUND", "Unit not found.");
  }

  async listProducts(
    actorId: string,
    options: ProductListOptions = {},
  ): Promise<ProductRecord[]> {
    const actor = await this.authorize(actorId, "products.read");
    const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
    const offset = Math.max(0, options.offset ?? 0);
    const search = options.search?.trim() ?? "";
    const escapedSearch = search
      .replaceAll("\\", "\\\\")
      .replaceAll("%", "\\%")
      .replaceAll("_", "\\_");
    const rows = await this.database.query<ProductRow>(
      `SELECT p.id, p.business_id, p.name, p.sku, p.description, p.tax_category,
          p.hsn_sac_code,p.gst_supply_type,p.gst_pricing_mode,p.category_id,
          p.category_name_snapshot, p.unit_id, p.unit_name_snapshot, p.unit_precision_snapshot,
          p.purchase_price_minor, p.selling_price_minor, p.reorder_threshold_scaled, p.is_active,
          p.archived_at, p.version,
          (SELECT b.value FROM barcode_mappings b WHERE b.product_id = p.id AND b.retired_at IS NULL
            ORDER BY b.created_at DESC LIMIT 1) AS active_barcode,
          (SELECT b.symbology FROM barcode_mappings b WHERE b.product_id = p.id AND b.retired_at IS NULL
            ORDER BY b.created_at DESC LIMIT 1) AS active_barcode_symbology
       FROM products p
       WHERE p.business_id = $1
         AND ($2 = '' OR p.name LIKE $3 ESCAPE '\\' OR p.normalized_sku LIKE $4 ESCAPE '\\' OR EXISTS (
           SELECT 1 FROM barcode_mappings b WHERE b.product_id = p.id AND b.value LIKE $3 ESCAPE '\\'
         ))
         AND ($5 IS NULL OR p.category_id = $5)
         AND ($6 = 1 OR p.archived_at IS NULL)
       ORDER BY p.name COLLATE NOCASE, p.id
       LIMIT $7 OFFSET $8`,
      [
        actor.businessId,
        search,
        `%${escapedSearch}%`,
        `%${normalized(search)}%`,
        options.categoryId ?? null,
        options.includeArchived ? 1 : 0,
        limit,
        offset,
      ],
    );
    return rows.map(mapProduct);
  }

  async saveProduct(
    actorId: string,
    value: ProductInput,
    productId?: string,
    expectedVersion?: number,
  ): Promise<ProductRecord> {
    const actor = await this.authorize(actorId, "products.manage");
    const input = validationResult(productSchema, value);
    const business = await this.getBusiness(actor.id);
    if (
      business.taxEnabled &&
      (input.gstSupplyType ?? "TAXABLE") === "TAXABLE"
    ) {
      if (!input.taxCategory.trim())
        throw new AppError(
          "VALIDATION",
          "Choose a configured GST tax category for this taxable product.",
          "taxCategory",
        );
      if (!input.hsnSacCode?.trim())
        throw new AppError(
          "VALIDATION",
          "Enter the product HSN/SAC code before enabling GST billing.",
          "hsnSacCode",
        );
    }
    const unitRows = await this.database.query<UnitRow>(
      `SELECT id, business_id, name, code, quantity_precision, archived_at
       FROM units WHERE id = $1 AND business_id = $2 AND archived_at IS NULL`,
      [input.unitId, actor.businessId],
    );
    const unit = unitRows[0];
    if (!unit)
      throw new AppError("VALIDATION", "Choose an active unit.", "unitId");

    let categoryName = "";
    if (input.categoryId) {
      const categoryRows = await this.database.query<CategoryRow>(
        `SELECT id, business_id, name, archived_at
         FROM categories WHERE id = $1 AND business_id = $2 AND archived_at IS NULL`,
        [input.categoryId, actor.businessId],
      );
      const category = categoryRows[0];
      if (!category)
        throw new AppError(
          "VALIDATION",
          "Choose an active category.",
          "categoryId",
        );
      categoryName = category.name;
    }

    const purchasePriceMinor = parseMoneyToMinorUnits(
      input.purchasePrice,
      business.currencyFractionDigits,
    );
    const sellingPriceMinor = parseMoneyToMinorUnits(
      input.sellingPrice,
      business.currencyFractionDigits,
    );
    const reorderThresholdScaled = parseQuantityToScaledInteger(
      input.reorderThreshold,
      unit.quantity_precision,
    );
    const id = productId ?? this.runtime.createId();
    const now = this.runtime.now();

    try {
      if (productId) {
        if (expectedVersion === undefined) {
          throw new AppError(
            "VALIDATION",
            "An expected product version is required to save edits.",
          );
        }
        const result = await this.database.execute(
          `UPDATE products SET name = $1, sku = $2, normalized_sku = $3, description = $4,
            tax_category = $5, category_id = $6, category_name_snapshot = $7, unit_id = $8,
            unit_name_snapshot = $9, unit_precision_snapshot = $10, purchase_price_minor = $11,
            selling_price_minor = $12, reorder_threshold_scaled = $13, version = version + 1,
            updated_at = $14, hsn_sac_code = $18, gst_supply_type = $19,
            gst_pricing_mode = $20
           WHERE id = $15 AND business_id = $16 AND version = $17 AND archived_at IS NULL`,
          [
            input.name,
            input.sku.trim(),
            normalized(input.sku),
            input.description,
            input.taxCategory,
            input.categoryId,
            categoryName,
            unit.id,
            unit.name,
            unit.quantity_precision,
            purchasePriceMinor,
            sellingPriceMinor,
            reorderThresholdScaled,
            now,
            productId,
            actor.businessId,
            expectedVersion,
            input.hsnSacCode ?? "",
            input.gstSupplyType ?? "TAXABLE",
            input.gstPricingMode ?? "EXCLUSIVE",
          ],
        );
        if (result.changes === 0) {
          const exists = await this.database.query<{ id: string }>(
            "SELECT id FROM products WHERE id = $1 AND business_id = $2 AND archived_at IS NULL",
            [productId, actor.businessId],
          );
          if (exists.length === 0)
            throw new AppError("NOT_FOUND", "Product not found or archived.");
          throw new AppError(
            "CONFLICT",
            "This product changed elsewhere. Reload it before saving.",
          );
        }
      } else {
        await this.database.execute(
          `INSERT INTO products (
            id, business_id, name, sku, normalized_sku, description, tax_category, category_id,
            category_name_snapshot, unit_id, unit_name_snapshot, unit_precision_snapshot,
            purchase_price_minor, selling_price_minor, reorder_threshold_scaled, created_at, updated_at,
            hsn_sac_code, gst_supply_type, gst_pricing_mode
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16, $17, $18, $19)`,
          [
            id,
            actor.businessId,
            input.name,
            input.sku.trim(),
            normalized(input.sku),
            input.description,
            input.taxCategory,
            input.categoryId,
            categoryName,
            unit.id,
            unit.name,
            unit.quantity_precision,
            purchasePriceMinor,
            sellingPriceMinor,
            reorderThresholdScaled,
            now,
            input.hsnSacCode ?? "",
            input.gstSupplyType ?? "TAXABLE",
            input.gstPricingMode ?? "EXCLUSIVE",
          ],
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isConstraintError(error)) {
        throw new AppError(
          "CONFLICT",
          "A product with this SKU already exists or its category/unit is unavailable.",
          "sku",
        );
      }
      throw error;
    }

    const product = await this.readProduct(actor.businessId, id);
    if (!product)
      throw new AppError(
        "PERSISTENCE",
        "The product could not be read after saving.",
      );
    return product;
  }

  async setProductArchived(
    actorId: string,
    productId: string,
    archived: boolean,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "products.manage");
    const now = this.runtime.now();
    const result = await this.database.execute(
      `UPDATE products SET archived_at = $1, is_active = $2, version = version + 1, updated_at = $3
       WHERE id = $4 AND business_id = $5`,
      [
        archived ? now : null,
        archived ? 0 : 1,
        now,
        productId,
        actor.businessId,
      ],
    );
    if (result.changes === 0)
      throw new AppError("NOT_FOUND", "Product not found.");
  }

  async previewProductsCsv(
    actorId: string,
    csvText: string,
  ): Promise<CsvPreviewRow[]> {
    const actor = await this.authorize(actorId, "products.import");
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
    });
    if (parsed.errors.length > 0) {
      throw new AppError(
        "VALIDATION",
        `CSV could not be parsed: ${parsed.errors[0]?.message ?? "invalid format"}`,
      );
    }
    const requiredHeaders = [
      "name",
      "sku",
      "description",
      "taxCategory",
      "category",
      "unit",
      "purchasePrice",
      "sellingPrice",
      "reorderThreshold",
    ];
    const headers = parsed.meta.fields ?? [];
    const missing = requiredHeaders.filter(
      (header) => !headers.includes(header),
    );
    if (missing.length > 0) {
      throw new AppError(
        "VALIDATION",
        `CSV is missing required columns: ${missing.join(", ")}.`,
      );
    }

    const categories = await this.database.query<CategoryRow>(
      `SELECT id, business_id, name, archived_at FROM categories
       WHERE business_id = $1 AND archived_at IS NULL`,
      [actor.businessId],
    );
    const units = await this.database.query<UnitRow>(
      `SELECT id, business_id, name, code, quantity_precision, archived_at FROM units
       WHERE business_id = $1 AND archived_at IS NULL`,
      [actor.businessId],
    );
    const business = await this.getBusiness(actor.id);
    const existingSkus = await this.database.query<{ normalized_sku: string }>(
      "SELECT normalized_sku FROM products WHERE business_id = $1",
      [actor.businessId],
    );
    const usedSkus = new Set(existingSkus.map((row) => row.normalized_sku));

    return parsed.data.map((rawRecord, index) => {
      const record = Object.fromEntries(
        Object.entries(rawRecord).map(([key, value]) => [
          key,
          typeof value === "string" ? restoreCsvValue(value) : value,
        ]),
      );
      const category = categories.find(
        (candidate) =>
          normalized(candidate.name) === normalized(record.category ?? ""),
      );
      const unit = units.find(
        (candidate) =>
          normalized(candidate.code) === normalized(record.unit ?? "") ||
          normalized(candidate.name) === normalized(record.unit ?? ""),
      );
      const inputResult = productSchema.safeParse({
        name: record.name ?? "",
        sku: record.sku ?? "",
        description: record.description ?? "",
        taxCategory: record.taxCategory ?? "",
        hsnSacCode: record.hsnSacCode ?? "",
        gstSupplyType: record.gstSupplyType || "TAXABLE",
        gstPricingMode: record.gstPricingMode || "EXCLUSIVE",
        categoryId: record.category?.trim() ? (category?.id ?? null) : null,
        unitId: unit?.id ?? "",
        purchasePrice: record.purchasePrice ?? "",
        sellingPrice: record.sellingPrice ?? "",
        reorderThreshold: record.reorderThreshold ?? "",
      });
      let error: string | null = null;
      if (record.category?.trim() && !category)
        error = "Category does not exist or is archived.";
      else if (!unit) error = "Unit does not exist or is archived.";
      else if (!inputResult.success)
        error = inputResult.error.issues[0]?.message ?? "Invalid product row.";
      if (!error && inputResult.success) {
        try {
          parseMoneyToMinorUnits(
            inputResult.data.purchasePrice,
            business.currencyFractionDigits,
          );
          parseMoneyToMinorUnits(
            inputResult.data.sellingPrice,
            business.currencyFractionDigits,
          );
          parseQuantityToScaledInteger(
            inputResult.data.reorderThreshold,
            unit?.quantity_precision ?? 0,
          );
        } catch (caught) {
          error =
            caught instanceof Error
              ? caught.message
              : "Invalid price or quantity.";
        }
      }
      if (!error && inputResult.success) {
        const sku = normalized(inputResult.data.sku);
        if (usedSkus.has(sku))
          error = "SKU already exists in the catalogue or this import.";
        else usedSkus.add(sku);
      }
      return {
        rowNumber: index + 2,
        product: error || !inputResult.success ? null : inputResult.data,
        error,
      };
    });
  }

  async importProductsCsv(
    actorId: string,
    csvText: string,
  ): Promise<CsvImportResult> {
    const actor = await this.authorize(actorId, "products.import");
    const preview = await this.previewProductsCsv(actor.id, csvText);
    let importedCount = 0;
    const errors: CsvImportResult["errors"] = preview
      .filter((row) => row.error)
      .map((row) => ({
        rowNumber: row.rowNumber,
        message: row.error ?? "Invalid row.",
      }));

    for (const row of preview) {
      if (!row.product || row.error) continue;
      try {
        await this.saveProduct(actor.id, row.product);
        importedCount += 1;
      } catch (error) {
        errors.push({
          rowNumber: row.rowNumber,
          message:
            error instanceof AppError
              ? error.message
              : "The product could not be imported.",
        });
      }
    }
    return { importedCount, errors };
  }

  async exportProductsCsv(actorId: string): Promise<string> {
    const actor = await this.authorize(actorId, "products.export");
    const business = await this.getBusiness(actor.id);
    const products: ProductRecord[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.listProducts(actor.id, {
        includeArchived: true,
        limit: 100,
        offset,
      });
      products.push(...page);
      if (page.length < 100) break;
    }
    const rows = products.map((product) => ({
      name: product.name,
      sku: product.sku,
      description: product.description,
      taxCategory: product.taxCategory,
      hsnSacCode: product.hsnSacCode,
      gstSupplyType: product.gstSupplyType,
      gstPricingMode: product.gstPricingMode,
      category: product.categoryName,
      unit: product.unitName,
      purchasePrice: minorUnitsToDecimal(
        product.purchasePriceMinor,
        business.currencyFractionDigits,
      ),
      sellingPrice: minorUnitsToDecimal(
        product.sellingPriceMinor,
        business.currencyFractionDigits,
      ),
      reorderThreshold: product.reorderThresholdScaled.toString(),
      active: product.isActive ? "true" : "false",
      barcode: product.activeBarcode ?? "",
    }));
    return Papa.unparse(safeCsvRows(rows), {
      columns: Object.keys(
        rows[0] ?? {
          name: "",
          sku: "",
          description: "",
          taxCategory: "",
          hsnSacCode: "",
          gstSupplyType: "TAXABLE",
          gstPricingMode: "EXCLUSIVE",
          category: "",
          unit: "",
          purchasePrice: "",
          sellingPrice: "",
          reorderThreshold: "",
          active: "",
          barcode: "",
        },
      ),
    });
  }

  async assignBarcode(
    actorId: string,
    productId: string,
    value: BarcodeInput,
  ): Promise<{ value: string; symbology: BarcodeSymbology }> {
    const actor = await this.authorize(actorId, "barcodes.manage");
    const input = validationResult(barcodeSchema, value);
    const normalizedValue = validateBarcode(input.value, input.symbology);
    const product = await this.readProduct(actor.businessId, productId);
    if (!product || product.archivedAt)
      throw new AppError("NOT_FOUND", "Active product not found.");
    const collision = await this.database.query<{ id: string }>(
      "SELECT id FROM barcode_mappings WHERE business_id = $1 AND value = $2 LIMIT 1",
      [actor.businessId, normalizedValue],
    );
    if (collision.length > 0)
      throw new AppError(
        "CONFLICT",
        "This barcode is already assigned and cannot be reused.",
        "value",
      );
    const active = await this.database.query<{ id: string }>(
      "SELECT id FROM barcode_mappings WHERE product_id = $1 AND retired_at IS NULL LIMIT 1",
      [productId],
    );
    if (active.length > 0) {
      const business = await this.getBusiness(actor.id);
      if (!business.allowMultipleBarcodes) {
        throw new AppError(
          "CONFLICT",
          "This product already has an active barcode.",
          "value",
        );
      }
    }
    await this.insertBarcode(
      actor,
      productId,
      normalizedValue,
      input.symbology,
      null,
      "",
    );
    return { value: normalizedValue, symbology: input.symbology };
  }

  async generateBarcodePreview(
    actorId: string,
    productId: string,
  ): Promise<{ value: string; symbology: "CODE128" }> {
    const actor = await this.authorize(actorId, "barcodes.manage");
    const product = await this.readProduct(actor.businessId, productId);
    if (!product || product.archivedAt)
      throw new AppError("NOT_FOUND", "Active product not found.");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const value = generateInternalBarcode(this.runtime.createId());
      const existing = await this.database.query<{ id: string }>(
        "SELECT id FROM barcode_mappings WHERE business_id = $1 AND value = $2",
        [actor.businessId, value],
      );
      if (existing.length === 0) {
        return { value, symbology: "CODE128" };
      }
    }
    throw new AppError(
      "CONFLICT",
      "A unique internal barcode could not be generated. Try again.",
    );
  }

  async remapBarcode(
    actorId: string,
    productId: string,
    value: BarcodeInput,
    reason: string,
  ): Promise<{ value: string; symbology: BarcodeSymbology }> {
    const actor = await this.authorize(actorId, "barcodes.manage");
    const input = validationResult(barcodeSchema, value);
    const normalizedValue = validateBarcode(input.value, input.symbology);
    const normalizedReason = reason.trim();
    if (!normalizedReason || normalizedReason.length > 500) {
      throw new AppError(
        "VALIDATION",
        "Enter a reason for changing the barcode.",
        "reason",
      );
    }
    const product = await this.readProduct(actor.businessId, productId);
    if (!product || product.archivedAt)
      throw new AppError("NOT_FOUND", "Active product not found.");
    const oldMappings = await this.database.query<{
      id: string;
      value: string;
    }>(
      `SELECT id, value FROM barcode_mappings
       WHERE product_id = $1 AND business_id = $2 AND retired_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [productId, actor.businessId],
    );
    const previous = oldMappings[0];
    if (!previous)
      throw new AppError(
        "NOT_FOUND",
        "This product has no active barcode to replace.",
      );
    if (previous.value === normalizedValue)
      throw new AppError(
        "VALIDATION",
        "The new barcode must be different.",
        "value",
      );
    const collision = await this.database.query<{ id: string }>(
      "SELECT id FROM barcode_mappings WHERE business_id = $1 AND value = $2 LIMIT 1",
      [actor.businessId, normalizedValue],
    );
    if (collision.length > 0)
      throw new AppError(
        "CONFLICT",
        "This barcode is already assigned and cannot be reused.",
        "value",
      );
    await this.insertBarcode(
      actor,
      productId,
      normalizedValue,
      input.symbology,
      previous.id,
      normalizedReason,
    );
    return { value: normalizedValue, symbology: input.symbology };
  }

  async getBarcodeHistory(
    actorId: string,
    productId: string,
  ): Promise<BarcodeHistoryRecord[]> {
    const actor = await this.authorize(actorId, "products.read");
    const product = await this.database.query<{ id: string }>(
      "SELECT id FROM products WHERE id = $1 AND business_id = $2",
      [productId, actor.businessId],
    );
    if (product.length === 0)
      throw new AppError("NOT_FOUND", "Product not found.");
    return this.database.query<BarcodeHistoryRecord>(
      `SELECT id, event_type AS eventType, previous_value AS previousValue, new_value AS newValue,
        symbology, actor_user_id AS actorUserId, reason, occurred_at AS occurredAt
       FROM barcode_history WHERE product_id = $1 ORDER BY occurred_at DESC`,
      [productId],
    );
  }

  async listSuppliers(actorId: string, search = ""): Promise<SupplierRecord[]> {
    const actor = await this.authorize(actorId, "suppliers.read");
    const query = normalized(search);
    const rows = await this.database.query<SupplierRecord>(
      `SELECT id, name, contact_name AS contactName, phone, email, address, archived_at AS archivedAt
       FROM suppliers WHERE business_id = $1 AND archived_at IS NULL
         AND ($2 = '' OR normalized_name LIKE $3 OR lower(phone) LIKE $3 OR lower(email) LIKE $3)
       ORDER BY normalized_name LIMIT 100`,
      [actor.businessId, query, `%${query}%`],
    );
    return rows;
  }

  async saveSupplier(
    actorId: string,
    value: SupplierInput,
    supplierId?: string,
  ): Promise<SupplierRecord> {
    const actor = await this.authorize(actorId, "suppliers.manage");
    const input = validationResult(supplierSchema, value);
    const now = this.runtime.now();
    const id = supplierId ?? this.runtime.createId();
    if (supplierId) {
      const result = await this.database.execute(
        `UPDATE suppliers SET name = $1, normalized_name = $2, contact_name = $3,
         phone = $4, email = $5, address = $6, updated_at = $7
         WHERE id = $8 AND business_id = $9 AND archived_at IS NULL`,
        [
          input.name,
          normalized(input.name),
          input.contactName,
          input.phone,
          input.email,
          input.address,
          now,
          id,
          actor.businessId,
        ],
      );
      if (!result.changes)
        throw new AppError("NOT_FOUND", "Supplier not found.");
    } else {
      await this.database.execute(
        `INSERT INTO suppliers (id, business_id, name, normalized_name, contact_name, phone, email, address, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
        [
          id,
          actor.businessId,
          input.name,
          normalized(input.name),
          input.contactName,
          input.phone,
          input.email,
          input.address,
          now,
        ],
      );
    }
    await this.database.execute(
      `INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
       VALUES ($1, $2, $3, $4, 'supplier', $5, $6)`,
      [
        this.runtime.createId(),
        actor.businessId,
        actor.id,
        supplierId ? "supplier.updated" : "supplier.created",
        id,
        now,
      ],
    );
    const rows = await this.database.query<SupplierRecord>(
      `SELECT id, name, contact_name AS contactName, phone, email, address, archived_at AS archivedAt
       FROM suppliers WHERE id = $1 AND business_id = $2`,
      [id, actor.businessId],
    );
    if (!rows[0])
      throw new AppError("PERSISTENCE", "Supplier could not be read.");
    return rows[0];
  }

  async archiveSupplier(actorId: string, supplierId: string): Promise<void> {
    const actor = await this.authorize(actorId, "suppliers.manage");
    const now = this.runtime.now();
    const result = await this.database.execute(
      "UPDATE suppliers SET archived_at = $1, updated_at = $1 WHERE id = $2 AND business_id = $3 AND archived_at IS NULL",
      [now, supplierId, actor.businessId],
    );
    if (!result.changes) throw new AppError("NOT_FOUND", "Supplier not found.");
    await this.database.execute(
      `INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
       VALUES ($1, $2, $3, 'supplier.archived', 'supplier', $4, $5)`,
      [this.runtime.createId(), actor.businessId, actor.id, supplierId, now],
    );
  }

  async receivePurchase(
    actorId: string,
    value: PurchaseInput,
  ): Promise<PurchaseRecord> {
    const actor = await this.authorize(actorId, "purchasing.manage");
    const input = validationResult(purchaseSchema, value);
    const supplier = await this.database.query<{
      id: string;
      name: string;
      gstin: string;
      state_code: string;
    }>(
      "SELECT id, name, gstin, state_code FROM suppliers WHERE id = $1 AND business_id = $2 AND archived_at IS NULL",
      [input.supplierId, actor.businessId],
    );
    if (!supplier[0])
      throw new AppError("NOT_FOUND", "An active supplier is required.");
    const business = await this.getBusiness(actorId);

    const taxEnabled = business.taxEnabled;

    if (supplier[0].gstin.trim().length > 0 && !hasValidGstinStructure(supplier[0].gstin)) {
      throw new AppError("VALIDATION", "Supplier GSTIN has an invalid structure.", "supplierId");
    }

    if (input.reverseCharge === true) {
      throw new AppError("UNSUPPORTED", "Reverse charge purchases are not supported in this phase.", "reverseCharge");
    }

    const prepared = [];
    let totalMinor = 0;
    let inputTaxTotalMinor = 0;

    for (const line of input.lines) {
      const product = await this.readProduct(actor.businessId, line.productId);
      if (!product || product.archivedAt || !product.isActive)
        throw new AppError(
          "NOT_FOUND",
          "An active product is required for purchase receipt.",
        );
      const quantityScaled = parseQuantityToScaledInteger(
        line.quantity,
        product.unitPrecision,
      );
      if (quantityScaled <= 0)
        throw new AppError(
          "VALIDATION",
          "Purchase quantity must be greater than zero.",
        );
      const unitCostMinor = parseMoneyToMinorUnits(
        line.unitCost,
        business.currencyFractionDigits,
      );
      if (
        BigInt(quantityScaled) * BigInt(unitCostMinor) >
        BigInt(Number.MAX_SAFE_INTEGER)
      )
        throw new AppError(
          "VALIDATION",
          "Quantity multiplied by unit cost exceeds the exact calculation limit.",
        );

      const hsnSacCode = line.hsnSacCode ?? product.hsnSacCode;
      const gstSupplyType = line.gstSupplyType ?? product.gstSupplyType;
      const gstPricingMode = line.gstPricingMode ?? product.gstPricingMode;
      const gstRateBasisPoints = line.gstRateBasisPoints ?? 0;
      const cessRateBasisPoints = line.cessRateBasisPoints ?? 0;
      const discountMinor = line.discountMinor ?? 0;

      if (taxEnabled && gstSupplyType === "TAXABLE" && !hasValidHsnSacStructure(hsnSacCode)) {
        throw new AppError(
          "VALIDATION",
          "Enter a valid 4, 6, or 8 digit HSN/SAC code for taxable purchases.",
          "hsnSacCode",
        );
      }

      const lineTotalMinor = roundedProduct(
        unitCostMinor,
        quantityScaled,
        10 ** product.unitPrecision,
      );
      const netLineMinor = lineTotalMinor;

      let gstResult;
      if (!taxEnabled || gstSupplyType !== "TAXABLE") {
        gstResult = {
          taxableValueMinor: netLineMinor,
          cgstMinor: 0,
          sgstMinor: 0,
          igstMinor: 0,
          cessMinor: 0,
          totalTaxMinor: 0,
          totalMinor: netLineMinor,
        };
      } else {
        gstResult = calculateGstLine({
          amountMinor: netLineMinor,
          discountMinor: 0,
          supplyType: gstSupplyType,
          pricingMode: gstPricingMode,
          gstRateBasisPoints,
          cessRateBasisPoints,
          supplierStateCode: supplier[0].state_code,
          placeOfSupplyStateCode: supplier[0].state_code,
        });
      }

      const inputTaxMinor = gstResult.cgstMinor + gstResult.sgstMinor + gstResult.igstMinor + gstResult.cessMinor;
      inputTaxTotalMinor += inputTaxMinor;
      totalMinor += lineTotalMinor;

      prepared.push({
        lineId: this.runtime.createId(),
        movementId: this.runtime.createId(),
        productId: product.id,
        quantityScaled,
        unitCostMinor,
        lineTotalMinor,
        hsnSacCode,
        gstSupplyType,
        gstPricingMode,
        gstRateBasisPoints,
        cessRateBasisPoints,
        taxableValueMinor: gstResult.taxableValueMinor,
        inputCgstMinor: gstResult.cgstMinor,
        inputSgstMinor: gstResult.sgstMinor,
        inputIgstMinor: gstResult.igstMinor,
        inputCessMinor: gstResult.cessMinor,
        discountMinor,
      });
    }
    if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(inputTaxTotalMinor))
      throw new AppError(
        "VALIDATION",
        "Purchase total exceeds the supported amount.",
      );

    const prior = await this.database.query<{
      id: string;
      supplier_id: string;
      reference_number: string;
      lines_json: string;
    }>(
      "SELECT id, supplier_id, reference_number, lines_json FROM purchases WHERE business_id = $1 AND idempotency_key = $2",
      [actor.businessId, input.idempotencyKey],
    );
    if (prior[0]) {
      let stored: Array<{
        productId: string;
        quantityScaled: number;
        unitCostMinor: number;
      }> = [];
      try {
        stored = JSON.parse(prior[0].lines_json) as typeof stored;
      } catch {
        /* malformed persisted value is handled as conflict */
      }
      const same =
        prior[0].supplier_id === input.supplierId &&
        prior[0].reference_number === input.referenceNumber &&
        stored.length === prepared.length &&
        prepared.every(
          (line, index) =>
            stored[index]?.productId === line.productId &&
            stored[index]?.quantityScaled === line.quantityScaled &&
            stored[index]?.unitCostMinor === line.unitCostMinor,
        );
      if (!same)
        throw new AppError(
          "CONFLICT",
          "This purchase request key was already used for different details.",
        );
      return this.readPurchase(actor.businessId, prior[0].id);
    }
    const purchaseId = this.runtime.createId();
    const linesJson = JSON.stringify(prepared);
    try {
      await this.database.execute(
        `INSERT INTO purchases (id, business_id, supplier_id, reference_number, idempotency_key, total_minor, actor_user_id, lines_json, supplier_invoice_number, supplier_invoice_date, supplier_gstin_snapshot, input_tax_total_minor, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          purchaseId,
          actor.businessId,
          input.supplierId,
          input.referenceNumber,
          input.idempotencyKey,
          totalMinor,
          actor.id,
          linesJson,
          input.supplierInvoiceNumber ?? "",
          input.supplierInvoiceDate ?? "",
          supplier[0].gstin,
          inputTaxTotalMinor,
          this.runtime.now(),
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) {
        const duplicate = await this.database.query<{
          id: string;
          supplier_id: string;
          reference_number: string;
          lines_json: string;
        }>(
          "SELECT id, supplier_id, reference_number, lines_json FROM purchases WHERE business_id = $1 AND idempotency_key = $2",
          [actor.businessId, input.idempotencyKey],
        );
        if (duplicate[0]) {
          let stored: Array<{
            productId: string;
            quantityScaled: number;
            unitCostMinor: number;
          }> = [];
          try {
            stored = JSON.parse(duplicate[0].lines_json) as typeof stored;
          } catch {
            /* malformed persisted value is handled as conflict */
          }
          const same =
            duplicate[0].supplier_id === input.supplierId &&
            duplicate[0].reference_number === input.referenceNumber &&
            stored.length === prepared.length &&
            prepared.every(
              (line, index) =>
                stored[index]?.productId === line.productId &&
                stored[index]?.quantityScaled === line.quantityScaled &&
                stored[index]?.unitCostMinor === line.unitCostMinor,
            );
          if (same) return this.readPurchase(actor.businessId, duplicate[0].id);
          throw new AppError(
            "CONFLICT",
            "This purchase request key was already used for different details.",
          );
        }
        throw persistenceConflict(error);
      }
      throw error;
    }
    return this.readPurchase(actor.businessId, purchaseId);
  }

  async listPurchases(
    actorId: string,
    supplierId?: string,
  ): Promise<PurchaseRecord[]> {
    const actor = await this.authorize(actorId, "purchasing.read");
    const rows = await this.database.query<{ id: string }>(
      `SELECT id FROM purchases WHERE business_id = $1 AND ($2 = '' OR supplier_id = $2) ORDER BY created_at DESC LIMIT 500`,
      [actor.businessId, supplierId ?? ""],
    );
    return Promise.all(
      rows.map((row) => this.readPurchase(actor.businessId, row.id)),
    );
  }

  private async readPurchase(
    businessId: string,
    purchaseId: string,
  ): Promise<PurchaseRecord> {
    const [headers, lines] = await Promise.all([
      this.database.query<{
        id: string;
        supplier_id: string;
        supplier_name: string;
        reference_number: string;
        supplier_invoice_number: string;
        supplier_invoice_date: string;
        supplier_gstin_snapshot: string;
        total_minor: number;
        input_tax_total_minor: number;
        created_at: string;
      }>(
        `SELECT p.id, p.supplier_id, s.name AS supplier_name, p.reference_number, p.supplier_invoice_number, p.supplier_invoice_date, p.supplier_gstin_snapshot, p.total_minor, p.input_tax_total_minor, p.created_at
         FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1 AND p.business_id = $2`,
        [purchaseId, businessId],
      ),
      this.database.query<{
        id: string;
        product_id: string;
        product_name_snapshot: string;
        sku_snapshot: string;
        quantity_scaled: number;
        unit_cost_minor: number;
        line_total_minor: number;
        hsn_sac_snapshot: string;
        gst_supply_type_snapshot: string;
        gst_rate_basis_points: number;
        taxable_value_minor: number;
        input_cgst_minor: number;
        input_sgst_minor: number;
        input_igst_minor: number;
        input_cess_minor: number;
        itc_status: string;
      }>(
        `SELECT id, product_id, product_name_snapshot, sku_snapshot, quantity_scaled, unit_cost_minor, line_total_minor, hsn_sac_snapshot, gst_supply_type_snapshot, gst_rate_basis_points, taxable_value_minor, input_cgst_minor, input_sgst_minor, input_igst_minor, input_cess_minor, itc_status
         FROM purchase_lines WHERE purchase_id = $1 ORDER BY rowid`,
        [purchaseId],
      ),
    ]);
    const row = headers[0];
    if (!row) throw new AppError("NOT_FOUND", "Purchase not found.");
    return {
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      referenceNumber: row.reference_number,
      supplierInvoiceNumber: row.supplier_invoice_number,
      supplierInvoiceDate: row.supplier_invoice_date,
      supplierGstinSnapshot: row.supplier_gstin_snapshot,
      status: "RECEIVED",
      totalMinor: row.total_minor,
      inputTaxTotalMinor: row.input_tax_total_minor,
      reverseCharge: false,
      createdAt: row.created_at,
      lines: lines.map((line) => ({
        id: line.id,
        productId: line.product_id,
        productName: line.product_name_snapshot,
        sku: line.sku_snapshot,
        quantityScaled: line.quantity_scaled,
        unitCostMinor: line.unit_cost_minor,
        lineTotalMinor: line.line_total_minor,
        gst: {
          hsnSacCode: line.hsn_sac_snapshot,
          gstSupplyType: line.gst_supply_type_snapshot as PurchaseRecord["lines"][number]["gst"]["gstSupplyType"],
          gstPricingMode: "EXCLUSIVE",
          gstRateBasisPoints: line.gst_rate_basis_points,
          cessRateBasisPoints: 0,
          taxableValueMinor: line.taxable_value_minor,
          inputCgstMinor: line.input_cgst_minor,
          inputSgstMinor: line.input_sgst_minor,
          inputIgstMinor: line.input_igst_minor,
          inputCessMinor: line.input_cess_minor,
          inputTaxMinor:
            line.input_cgst_minor +
            line.input_sgst_minor +
            line.input_igst_minor +
            line.input_cess_minor,
          itcStatus: (line.itc_status || "UNASSESSED") as PurchaseRecord["lines"][number]["gst"]["itcStatus"],
        },
      })),
    };
  }

  async classifyPurchaseItc(
    actorId: string,
    purchaseId: string,
    purchaseLineId: string,
    classification: ItcClassification,
    reason: string,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "purchasing.manage");
    const now = this.runtime.now();

    const line = await this.database.query<{
      id: string;
      purchase_id: string;
      itc_status: string;
      input_cgst_minor: number;
      input_sgst_minor: number;
      input_igst_minor: number;
      input_cess_minor: number;
      gst_supply_type_snapshot: string;
    }>(
      `SELECT pl.id, pl.purchase_id, pl.itc_status, pl.input_cgst_minor, pl.input_sgst_minor, pl.input_igst_minor, pl.input_cess_minor, pl.gst_supply_type_snapshot
       FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id
       WHERE pl.id = $1 AND pl.purchase_id = $2 AND p.business_id = $3`,
      [purchaseLineId, purchaseId, actor.businessId],
    );
    if (!line[0])
      throw new AppError("NOT_FOUND", "Purchase line not found.");
    if (line[0].gst_supply_type_snapshot !== "TAXABLE")
      throw new AppError(
        "VALIDATION",
        "ITC can only be classified for taxable purchase lines.",
      );

    const idempotencyKey = `itc-classify:${purchaseLineId}:${classification}:${now}`;
    try {
      await this.database.execute(
        `UPDATE purchase_lines SET itc_status = $1 WHERE id = $2`,
        [classification, purchaseLineId],
      );
      await this.database.execute(
        `INSERT INTO purchase_itc_adjustments (id, business_id, purchase_id, purchase_line_id, actor_user_id, adjustment_type, cgst_minor, sgst_minor, igst_minor, cess_minor, reason, idempotency_key, occurred_at)
         VALUES ($1, $2, $3, $4, $5, 'CLAIM', $6, $7, $8, $9, $10, $11, $12)`,
        [
          this.runtime.createId(),
          actor.businessId,
          purchaseId,
          purchaseLineId,
          actor.id,
          line[0].input_cgst_minor,
          line[0].input_sgst_minor,
          line[0].input_igst_minor,
          line[0].input_cess_minor,
          reason.trim(),
          idempotencyKey,
          now,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
  }


  async adjustPurchaseItc(
    actorId: string,
    value: PurchaseItcAdjustmentInput,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "purchasing.manage");
    const input = validationResult(purchaseItcAdjustmentSchema, value);
    const now = this.runtime.now();

    const line = await this.database.query<{
      id: string;
      purchase_id: string;
      input_cgst_minor: number;
      input_sgst_minor: number;
      input_igst_minor: number;
      input_cess_minor: number;
    }>(
      `SELECT pl.id, pl.purchase_id, pl.input_cgst_minor, pl.input_sgst_minor, pl.input_igst_minor, pl.input_cess_minor
       FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id
       WHERE pl.id = $1 AND p.business_id = $2`,
      [input.purchaseLineId, actor.businessId],
    );
    if (!line[0])
      throw new AppError("NOT_FOUND", "Purchase line not found.");
    if (line[0].purchase_id !== input.purchaseId)
      throw new AppError("VALIDATION", "Purchase line does not belong to the specified purchase.");

    const adjustmentTotal =
      input.cgstMinor + input.sgstMinor + input.igstMinor + input.cessMinor;
    if (adjustmentTotal <= 0)
      throw new AppError(
        "VALIDATION",
        "Adjustment amount must be greater than zero.",
      );

    const prior = await this.database.query<{
      id: string;
    }>(
      "SELECT id FROM purchase_itc_adjustments WHERE business_id = $1 AND idempotency_key = $2",
      [actor.businessId, input.idempotencyKey],
    );
    if (prior[0])
      return;

    try {
      await this.database.execute(
        `INSERT INTO purchase_itc_adjustments (id, business_id, purchase_id, purchase_line_id, actor_user_id, adjustment_type, cgst_minor, sgst_minor, igst_minor, cess_minor, reason, idempotency_key, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          this.runtime.createId(),
          actor.businessId,
          input.purchaseId,
          input.purchaseLineId,
          actor.id,
          input.adjustmentType,
          input.cgstMinor,
          input.sgstMinor,
          input.igstMinor,
          input.cessMinor,
          input.reason.trim(),
          input.idempotencyKey,
          now,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
  }

  async listPurchaseItcAdjustments(
    actorId: string,
    purchaseId?: string,
  ): Promise<PurchaseItcAdjustmentRecord[]> {
    const actor = await this.authorize(actorId, "purchasing.read");
    const rows = await this.database.query<{
      id: string;
      purchase_id: string;
      purchase_line_id: string;
      adjustment_type: string;
      cgst_minor: number;
      sgst_minor: number;
      igst_minor: number;
      cess_minor: number;
      reason: string;
      occurred_at: string;
    }>(
      `SELECT id, purchase_id, purchase_line_id, adjustment_type, cgst_minor, sgst_minor, igst_minor, cess_minor, reason, occurred_at
       FROM purchase_itc_adjustments WHERE business_id = $1 AND ($2 = '' OR purchase_id = $2)
       ORDER BY occurred_at DESC, id DESC`,
      [actor.businessId, purchaseId ?? ""],
    );
    return rows.map((row) => ({
      id: row.id,
      purchaseId: row.purchase_id,
      purchaseLineId: row.purchase_line_id,
      adjustmentType: row.adjustment_type as ItcAdjustmentType,
      cgstMinor: row.cgst_minor,
      sgstMinor: row.sgst_minor,
      igstMinor: row.igst_minor,
      cessMinor: row.cess_minor,
      reason: row.reason,
      occurredAt: row.occurred_at,
      actorName: "",
    }));
  }

  async createSupplierCredit(
    actorId: string,
    value: SupplierCreditInput,
  ): Promise<SupplierCreditRecord> {
    const actor = await this.authorize(actorId, "purchasing.manage");
    const input = validationResult(supplierCreditSchema, value);
    const prior = await this.database.query<{
      id: string;
      supplier_id: string;
      purchase_id: string;
      reason: string;
      credit_minor: number;
      created_at: string;
      lines_json: string;
    }>(
      "SELECT id,supplier_id,purchase_id,reason,credit_minor,created_at,lines_json FROM supplier_credits WHERE business_id=$1 AND idempotency_key=$2",
      [actor.businessId, input.idempotencyKey],
    );
    if (prior[0]) {
      let stored: Array<{ purchaseLineId: string; quantityScaled: number }> =
        [];
      try {
        stored = JSON.parse(prior[0].lines_json) as typeof stored;
      } catch {
        throw new AppError(
          "PERSISTENCE",
          "Stored supplier credit request is unreadable.",
        );
      }
      const sameHeader =
        prior[0].supplier_id === input.supplierId &&
        prior[0].purchase_id === input.purchaseId &&
        prior[0].reason === input.reason;
      let sameLines = sameHeader && stored.length === input.lines.length;
      for (let index = 0; index < input.lines.length && sameLines; index++) {
        const requested = input.lines[index],
          previous = stored[index];
        if (!requested || !previous) {
          sameLines = false;
          break;
        }
        const precision = await this.database.query<{ unit_precision: number }>(
          "SELECT unit_precision FROM purchase_lines WHERE id=$1 AND purchase_id=$2",
          [requested.purchaseLineId, input.purchaseId],
        );
        sameLines =
          Boolean(precision[0]) &&
          previous.purchaseLineId === requested.purchaseLineId &&
          previous.quantityScaled ===
            parseQuantityToScaledInteger(
              requested.quantity,
              precision[0]!.unit_precision,
            );
      }
      if (!sameLines)
        throw new AppError(
          "CONFLICT",
          "This supplier credit key was already used for different details.",
        );
      return {
        id: prior[0].id,
        supplierId: prior[0].supplier_id,
        purchaseId: prior[0].purchase_id,
        reason: prior[0].reason,
        creditMinor: prior[0].credit_minor,
        createdAt: prior[0].created_at,
      };
    }
    const purchase = await this.database.query<{ id: string }>(
      "SELECT id FROM purchases WHERE id=$1 AND business_id=$2 AND supplier_id=$3",
      [input.purchaseId, actor.businessId, input.supplierId],
    );
    if (!purchase[0])
      throw new AppError(
        "NOT_FOUND",
        "Original supplier purchase was not found.",
      );
    const prepared: Array<{
      lineId: string;
      movementId: string;
      purchaseLineId: string;
      quantityScaled: number;
      creditMinor: number;
    }> = [];
    let total = 0;
    for (const line of input.lines) {
      const rows = await this.database.query<{
        unit_precision: number;
        quantity_scaled: number;
        line_total_minor: number;
        credited_quantity: number;
        credited_minor: number;
      }>(
        "SELECT pl.unit_precision,pl.quantity_scaled,pl.line_total_minor,coalesce(sum(scl.quantity_scaled),0) AS credited_quantity,coalesce(sum(scl.credit_minor),0) AS credited_minor FROM purchase_lines pl LEFT JOIN supplier_credit_lines scl ON scl.purchase_line_id=pl.id WHERE pl.id=$1 AND pl.purchase_id=$2 GROUP BY pl.id",
        [line.purchaseLineId, input.purchaseId],
      );
      const row = rows[0];
      if (!row)
        throw new AppError(
          "NOT_FOUND",
          "Returned item is not part of the original purchase.",
        );
      const qty = parseQuantityToScaledInteger(
          line.quantity,
          row.unit_precision,
        ),
        remainQty = row.quantity_scaled - row.credited_quantity,
        remainValue = row.line_total_minor - row.credited_minor;
      if (qty <= 0 || qty > remainQty)
        throw new AppError(
          "CONFLICT",
          "Return quantity exceeds the uncredited purchase quantity.",
        );
      const valueMinor =
        qty === remainQty
          ? remainValue
          : roundedProduct(remainValue, qty, remainQty);
      prepared.push({
        lineId: this.runtime.createId(),
        movementId: this.runtime.createId(),
        purchaseLineId: line.purchaseLineId,
        quantityScaled: qty,
        creditMinor: valueMinor,
      });
      total += valueMinor;
      if (!Number.isSafeInteger(total))
        throw new AppError(
          "VALIDATION",
          "Supplier credit exceeds the supported amount.",
        );
    }
    const id = this.runtime.createId(),
      createdAt = this.runtime.now();
    try {
      await this.database.execute(
        "INSERT INTO supplier_credits(id,business_id,supplier_id,purchase_id,actor_user_id,reason,idempotency_key,credit_minor,lines_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          id,
          actor.businessId,
          input.supplierId,
          input.purchaseId,
          actor.id,
          input.reason,
          input.idempotencyKey,
          total,
          JSON.stringify(prepared),
          createdAt,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) {
        const prior = await this.database.query<{
          id: string;
          supplier_id: string;
          purchase_id: string;
          reason: string;
          credit_minor: number;
          created_at: string;
          lines_json: string;
        }>(
          "SELECT id,supplier_id,purchase_id,reason,credit_minor,created_at,lines_json FROM supplier_credits WHERE business_id=$1 AND idempotency_key=$2",
          [actor.businessId, input.idempotencyKey],
        );
        if (
          prior[0] &&
          prior[0].supplier_id === input.supplierId &&
          prior[0].purchase_id === input.purchaseId &&
          prior[0].reason === input.reason
        ) {
          const stored = JSON.parse(prior[0].lines_json) as typeof prepared;
          if (
            stored.length === prepared.length &&
            prepared.every(
              (line, index) =>
                stored[index]?.purchaseLineId === line.purchaseLineId &&
                stored[index]?.quantityScaled === line.quantityScaled,
            )
          )
            return {
              id: prior[0].id,
              supplierId: prior[0].supplier_id,
              purchaseId: prior[0].purchase_id,
              reason: prior[0].reason,
              creditMinor: prior[0].credit_minor,
              createdAt: prior[0].created_at,
            };
        }
        throw persistenceConflict(error);
      }
      throw error;
    }
    return {
      id,
      supplierId: input.supplierId,
      purchaseId: input.purchaseId,
      reason: input.reason,
      creditMinor: total,
      createdAt,
    };
  }

  async listSupplierCredits(
    actorId: string,
    supplierId?: string,
  ): Promise<SupplierCreditRecord[]> {
    const actor = await this.authorize(actorId, "purchasing.read");
    return this.database.query<SupplierCreditRecord>(
      "SELECT id,supplier_id AS supplierId,purchase_id AS purchaseId,reason,credit_minor AS creditMinor,created_at AS createdAt FROM supplier_credits WHERE business_id=$1 AND ($2='' OR supplier_id=$2) ORDER BY created_at DESC LIMIT 500",
      [actor.businessId, supplierId ?? ""],
    );
  }

  async getSupplierBalances(actorId: string): Promise<SupplierBalanceRecord[]> {
    const actor = await this.authorize(actorId, "purchasing.read");
    return this.database.query<SupplierBalanceRecord>(
      "SELECT s.id AS supplierId,s.name AS supplierName,coalesce((SELECT sum(total_minor) FROM purchases p WHERE p.supplier_id=s.id),0) AS purchasesMinor,coalesce((SELECT sum(credit_minor) FROM supplier_credits c WHERE c.supplier_id=s.id),0) AS creditsMinor,coalesce((SELECT sum(amount_minor) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) AS paymentsMinor,coalesce((SELECT sum(total_minor) FROM purchases p WHERE p.supplier_id=s.id),0)-coalesce((SELECT sum(credit_minor) FROM supplier_credits c WHERE c.supplier_id=s.id),0)-coalesce((SELECT sum(amount_minor) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) AS outstandingMinor FROM suppliers s WHERE s.business_id=$1 ORDER BY s.normalized_name",
      [actor.businessId],
    );
  }

  async listSupplierPayments(
    actorId: string,
    supplierId?: string,
  ): Promise<SupplierPaymentRecord[]> {
    const actor = await this.authorize(actorId, "purchasing.read");
    return this.database.query<SupplierPaymentRecord>(
      "SELECT id,supplier_id AS supplierId,amount_minor AS amountMinor,method,reference,occurred_at AS occurredAt FROM supplier_payments WHERE business_id=$1 AND ($2='' OR supplier_id=$2) ORDER BY occurred_at DESC LIMIT 500",
      [actor.businessId, supplierId ?? ""],
    );
  }

  async recordSupplierPayment(
    actorId: string,
    value: SupplierPaymentInput,
  ): Promise<SupplierBalanceRecord> {
    const actor = await this.authorize(actorId, "purchasing.manage"),
      input = validationResult(supplierPaymentSchema, value);
    const amount = parseMoneyToMinorUnits(
      input.amount,
      (await this.getBusiness(actorId)).currencyFractionDigits,
    );
    if (amount <= 0)
      throw new AppError(
        "VALIDATION",
        "Supplier payment must be greater than zero.",
      );
    const prior = await this.database.query<{
      supplier_id: string;
      amount_minor: number;
      method: string;
      reference: string;
    }>(
      "SELECT supplier_id,amount_minor,method,reference FROM supplier_payments WHERE business_id=$1 AND idempotency_key=$2",
      [actor.businessId, input.idempotencyKey],
    );
    if (prior[0]) {
      if (
        prior[0].supplier_id !== input.supplierId ||
        prior[0].amount_minor !== amount ||
        prior[0].method !== input.method ||
        prior[0].reference !== input.reference
      )
        throw new AppError(
          "CONFLICT",
          "Payment request key was used for different details.",
        );
    } else {
      try {
        await this.database.execute(
          "INSERT INTO supplier_payments(id,business_id,supplier_id,actor_user_id,amount_minor,method,reference,idempotency_key,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            this.runtime.createId(),
            actor.businessId,
            input.supplierId,
            actor.id,
            amount,
            input.method,
            input.reference,
            input.idempotencyKey,
            this.runtime.now(),
          ],
        );
      } catch (error) {
        if (isConstraintError(error)) {
          const duplicate = await this.database.query<{
            supplier_id: string;
            amount_minor: number;
            method: string;
            reference: string;
          }>(
            "SELECT supplier_id,amount_minor,method,reference FROM supplier_payments WHERE business_id=$1 AND idempotency_key=$2",
            [actor.businessId, input.idempotencyKey],
          );
          if (
            !duplicate[0] ||
            duplicate[0].supplier_id !== input.supplierId ||
            duplicate[0].amount_minor !== amount ||
            duplicate[0].method !== input.method ||
            duplicate[0].reference !== input.reference
          )
            throw persistenceConflict(error);
        } else throw error;
      }
    }
    const balance = (await this.getSupplierBalances(actorId)).find(
      (row) => row.supplierId === input.supplierId,
    );
    if (!balance) throw new AppError("NOT_FOUND", "Supplier not found.");
    return balance;
  }

  async getPurchaseReport(
    actorId: string,
    value: DateRangeInput,
  ): Promise<PurchaseReport> {
    const actor = await this.authorize(actorId, "purchasing.read"),
      input = validationResult(dateRangeSchema, value);
    const groupBy = input.groupBy ?? "day";
    const [purchases, credits, payments, balances, transactions, business] =
      await Promise.all([
        this.database.query<{
          supplier_id: string;
          count: number;
          amount: number;
        }>(
          "SELECT supplier_id,count(*) AS count,sum(total_minor) AS amount FROM purchases WHERE business_id=$1 AND created_at>=$2 AND created_at<$3 GROUP BY supplier_id",
          [actor.businessId, input.from, input.to],
        ),
        this.database.query<{ supplier_id: string; amount: number }>(
          "SELECT supplier_id,sum(credit_minor) AS amount FROM supplier_credits WHERE business_id=$1 AND created_at>=$2 AND created_at<$3 GROUP BY supplier_id",
          [actor.businessId, input.from, input.to],
        ),
        this.database.query<{ supplier_id: string; amount: number }>(
          "SELECT supplier_id,sum(amount_minor) AS amount FROM supplier_payments WHERE business_id=$1 AND occurred_at>=$2 AND occurred_at<$3 GROUP BY supplier_id",
          [actor.businessId, input.from, input.to],
        ),
        this.getSupplierBalances(actorId),
        this.database.query<{
          occurred_at: string;
          kind: string;
          amount: number;
        }>(
          "SELECT created_at AS occurred_at,'purchase' AS kind,total_minor AS amount FROM purchases WHERE business_id=$1 AND created_at>=$2 AND created_at<$3 UNION ALL SELECT created_at,'credit',credit_minor FROM supplier_credits WHERE business_id=$1 AND created_at>=$2 AND created_at<$3 UNION ALL SELECT occurred_at,'payment',amount_minor FROM supplier_payments WHERE business_id=$1 AND occurred_at>=$2 AND occurred_at<$3",
          [actor.businessId, input.from, input.to],
        ),
        this.getBusiness(actorId),
      ]);
    const bySupplier = new Map(
      balances.map((row) => [
        row.supplierId,
        { ...row, purchasesMinor: 0, creditsMinor: 0, paymentsMinor: 0 },
      ]),
    );
    for (const row of purchases) {
      const item = bySupplier.get(row.supplier_id);
      if (item) item.purchasesMinor = row.amount;
    }
    for (const row of credits) {
      const item = bySupplier.get(row.supplier_id);
      if (item) item.creditsMinor = row.amount;
    }
    for (const row of payments) {
      const item = bySupplier.get(row.supplier_id);
      if (item) item.paymentsMinor = row.amount;
    }
    const suppliers = [...bySupplier.values()].filter(
      (row) => row.purchasesMinor || row.creditsMinor || row.paymentsMinor,
    );
    const sum = (rows: Array<{ amount: number }>) =>
      rows.reduce((total, row) => total + row.amount, 0);
    const purchasesMinor = sum(purchases),
      creditsMinor = sum(credits);
    const grouped = new Map<string, PurchaseReport["groups"][number]>();
    for (const row of transactions) {
      const period = groupPeriod(row.occurred_at, groupBy, business.timezone);
      const group = grouped.get(period) ?? {
        period,
        purchaseCount: 0,
        purchasesMinor: 0,
        creditsMinor: 0,
        netPurchasesMinor: 0,
        paymentsMinor: 0,
      };
      if (row.kind === "purchase") {
        group.purchaseCount++;
        group.purchasesMinor += row.amount;
      } else if (row.kind === "credit") group.creditsMinor += row.amount;
      else group.paymentsMinor += row.amount;
      group.netPurchasesMinor = group.purchasesMinor - group.creditsMinor;
      grouped.set(period, group);
    }
    return {
      from: input.from,
      to: input.to,
      groupBy,
      groups: [...grouped.values()].sort((a, b) =>
        a.period.localeCompare(b.period),
      ),
      purchaseCount: purchases.reduce((n, row) => n + row.count, 0),
      purchasesMinor,
      creditsMinor,
      netPurchasesMinor: purchasesMinor - creditsMinor,
      paymentsMinor: sum(payments),
      suppliers,
    };
  }

  exportPurchaseReportCsv(report: PurchaseReport): string {
    return Papa.unparse(
      safeCsvRows(
        report.suppliers.map((row) => ({
          supplier: row.supplierName,
          purchasesMinor: row.purchasesMinor,
          creditsMinor: row.creditsMinor,
          paymentsMinor: row.paymentsMinor,
          outstandingMinor: row.outstandingMinor,
        })),
      ),
      {
        columns: [
          "supplier",
          "purchasesMinor",
          "creditsMinor",
          "paymentsMinor",
          "outstandingMinor",
        ],
      },
    );
  }


  async getGstSalesRegister(
    actorId: string,
    value: GstRegisterInput,
  ): Promise<GstRegister> {
    const actor = await this.authorize(actorId, "billing.read");
    const input = validationResult(gstRegisterSchema, value);

    const rows = await this.database.query<{
      id: string;
      invoice_number: string;
      created_at: string;
      customer_gstin_snapshot: string;
      customer_name: string;
      document_type: string;
      status: string;
      subtotal_minor: number;
      tax_minor: number;
      total_minor: number;
      cgst_minor: number;
      sgst_minor: number;
      igst_minor: number;
      cess_minor: number;
      taxable_value_minor: number;
    }>(
      `SELECT i.id, i.invoice_number, i.created_at, i.customer_gstin_snapshot,
        coalesce(nullif(i.customer_name_snapshot,''), 'Walk-in') AS customer_name,
        i.gst_document_type AS document_type, i.status,
        i.subtotal_minor, i.tax_minor, i.total_minor,
        coalesce(sum(il.cgst_minor),0) AS cgst_minor,
        coalesce(sum(il.sgst_minor),0) AS sgst_minor,
        coalesce(sum(il.igst_minor),0) AS igst_minor,
        coalesce(sum(il.cess_minor),0) AS cess_minor,
        coalesce(sum(il.gst_taxable_value_minor),0) AS taxable_value_minor
       FROM invoices i
       LEFT JOIN invoice_lines il ON il.invoice_id = i.id
       WHERE i.business_id = $1 AND i.created_at >= $2 AND i.created_at < $3
       GROUP BY i.id, i.invoice_number, i.created_at, i.customer_gstin_snapshot, i.customer_name_snapshot, i.gst_document_type, i.status, i.subtotal_minor, i.tax_minor, i.total_minor
       ORDER BY i.created_at DESC`,
      [actor.businessId, input.from, input.to],
    );

    const lines: GstRegisterLine[] = rows.map((row) => ({
      documentNumber: row.invoice_number,
      documentDate: row.created_at,
      partyGstin: row.customer_gstin_snapshot,
      partyName: row.customer_name,
      hsnSacCode: "",
      taxableValueMinor: row.taxable_value_minor,
      cgstMinor: row.cgst_minor,
      sgstMinor: row.sgst_minor,
      igstMinor: row.igst_minor,
      cessMinor: row.cess_minor,
      totalTaxMinor: row.tax_minor,
      totalMinor: row.total_minor,
      documentType: row.document_type,
      status: row.status,
      reference: row.id,
    }));

    const totals = lines.reduce(
      (acc, line) => ({
        taxableValueMinor: acc.taxableValueMinor + line.taxableValueMinor,
        cgstMinor: acc.cgstMinor + line.cgstMinor,
        sgstMinor: acc.sgstMinor + line.sgstMinor,
        igstMinor: acc.igstMinor + line.igstMinor,
        cessMinor: acc.cessMinor + line.cessMinor,
        totalTaxMinor: acc.totalTaxMinor + line.totalTaxMinor,
        totalMinor: acc.totalMinor + line.totalMinor,
      }),
      {
        taxableValueMinor: 0,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        cessMinor: 0,
        totalTaxMinor: 0,
        totalMinor: 0,
      },
    );

    return {
      scope: "SALES",
      from: input.from,
      to: input.to,
      lines,
      totals,
    };
  }

  async getGstPurchaseRegister(
    actorId: string,
    value: GstRegisterInput,
  ): Promise<GstRegister> {
    const actor = await this.authorize(actorId, "purchasing.read");
    const input = validationResult(gstRegisterSchema, value);

    const rows = await this.database.query<{
      id: string;
      reference_number: string;
      supplier_invoice_number: string;
      supplier_invoice_date: string;
      supplier_gstin_snapshot: string;
      supplier_name: string;
      created_at: string;
      total_minor: number;
      input_tax_total_minor: number;
    }>(
      `SELECT p.id, p.reference_number, p.supplier_invoice_number, p.supplier_invoice_date, p.supplier_gstin_snapshot, s.name AS supplier_name, p.created_at, p.total_minor, p.input_tax_total_minor
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.business_id = $1 AND p.created_at >= $2 AND p.created_at < $3
       ORDER BY p.created_at DESC`,
      [actor.businessId, input.from, input.to],
    );

    const lineDetails = await this.database.query<{
      purchase_id: string;
      hsn_sac_snapshot: string;
      taxable_value_minor: number;
      input_cgst_minor: number;
      input_sgst_minor: number;
      input_igst_minor: number;
      input_cess_minor: number;
    }>(
      `SELECT purchase_id, hsn_sac_snapshot, taxable_value_minor, input_cgst_minor, input_sgst_minor, input_igst_minor, input_cess_minor
       FROM purchase_lines WHERE purchase_id IN (
         SELECT id FROM purchases WHERE business_id = $1 AND created_at >= $2 AND created_at < $3
       )`,
      [actor.businessId, input.from, input.to],
    );

    const detailsByPurchase = new Map<string, Array<typeof lineDetails[number]>>();
    for (const d of lineDetails) {
      const arr = detailsByPurchase.get(d.purchase_id) ?? [];
      arr.push(d);
      detailsByPurchase.set(d.purchase_id, arr);
    }

    const lines: GstRegisterLine[] = rows.map((row) => {
      const details = detailsByPurchase.get(row.id) ?? [];
      const taxableValueMinor = details.reduce((sum, d) => sum + d.taxable_value_minor, 0);
      const cgstMinor = details.reduce((sum, d) => sum + d.input_cgst_minor, 0);
      const sgstMinor = details.reduce((sum, d) => sum + d.input_sgst_minor, 0);
      const igstMinor = details.reduce((sum, d) => sum + d.input_igst_minor, 0);
      const cessMinor = details.reduce((sum, d) => sum + d.input_cess_minor, 0);
      const totalTaxMinor = cgstMinor + sgstMinor + igstMinor + cessMinor;
      return {
        documentNumber: row.supplier_invoice_number || row.reference_number,
        documentDate: row.supplier_invoice_date || row.created_at,
        partyGstin: row.supplier_gstin_snapshot,
        partyName: row.supplier_name,
        hsnSacCode: details.length > 0 ? details[0]!.hsn_sac_snapshot : "",
        taxableValueMinor,
        cgstMinor,
        sgstMinor,
        igstMinor,
        cessMinor,
        totalTaxMinor,
        totalMinor: row.total_minor,
        documentType: "PURCHASE",
        status: "RECEIVED",
        reference: row.id,
      };
    });

    const totals = lines.reduce(
      (acc, line) => ({
        taxableValueMinor: acc.taxableValueMinor + line.taxableValueMinor,
        cgstMinor: acc.cgstMinor + line.cgstMinor,
        sgstMinor: acc.sgstMinor + line.sgstMinor,
        igstMinor: acc.igstMinor + line.igstMinor,
        cessMinor: acc.cessMinor + line.cessMinor,
        totalTaxMinor: acc.totalTaxMinor + line.totalTaxMinor,
        totalMinor: acc.totalMinor + line.totalMinor,
      }),
      {
        taxableValueMinor: 0,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        cessMinor: 0,
        totalTaxMinor: 0,
        totalMinor: 0,
      },
    );

    return {
      scope: "PURCHASES",
      from: input.from,
      to: input.to,
      lines,
      totals,
    };
  }


  async getGstTaxSummary(
    actorId: string,
    value: GstRegisterInput,
  ): Promise<GstTaxSummary[]> {
    const actor = await this.authorize(actorId, "billing.read");
    const input = validationResult(gstRegisterSchema, value);

    const rows = await this.database.query<{
      cgst_minor: number;
      sgst_minor: number;
      igst_minor: number;
      cess_minor: number;
      taxable_value_minor: number;
    }>(
      `SELECT coalesce(sum(il.cgst_minor),0) AS cgst_minor,
        coalesce(sum(il.sgst_minor),0) AS sgst_minor,
        coalesce(sum(il.igst_minor),0) AS igst_minor,
        coalesce(sum(il.cess_minor),0) AS cess_minor,
        coalesce(sum(il.gst_taxable_value_minor),0) AS taxable_value_minor
       FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
       WHERE i.business_id = $1 AND i.created_at >= $2 AND i.created_at < $3 AND i.status = 'POSTED'`,
      [actor.businessId, input.from, input.to],
    );

    const row = rows[0];
    return [
      {
        taxHead: "CGST",
        taxableValueMinor: row?.taxable_value_minor ?? 0,
        taxMinor: row?.cgst_minor ?? 0,
      },
      {
        taxHead: "SGST",
        taxableValueMinor: row?.taxable_value_minor ?? 0,
        taxMinor: row?.sgst_minor ?? 0,
      },
      {
        taxHead: "IGST",
        taxableValueMinor: row?.taxable_value_minor ?? 0,
        taxMinor: row?.igst_minor ?? 0,
      },
      {
        taxHead: "CESS",
        taxableValueMinor: row?.taxable_value_minor ?? 0,
        taxMinor: row?.cess_minor ?? 0,
      },
    ];
  }


  async getGstItcSummary(
    actorId: string,
    value: GstRegisterInput,
  ): Promise<GstItcSummary[]> {
    const actor = await this.authorize(actorId, "purchasing.read");
    const input = validationResult(gstRegisterSchema, value);

    const rows = await this.database.query<{
      itc_status: string;
      cgst_minor: number;
      sgst_minor: number;
      igst_minor: number;
      cess_minor: number;
      line_count: number;
    }>(
      `SELECT pl.itc_status,
        coalesce(sum(pl.input_cgst_minor),0) AS cgst_minor,
        coalesce(sum(pl.input_sgst_minor),0) AS sgst_minor,
        coalesce(sum(pl.input_igst_minor),0) AS igst_minor,
        coalesce(sum(pl.input_cess_minor),0) AS cess_minor,
        count(*) AS line_count
       FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id
       WHERE p.business_id = $1 AND p.created_at >= $2 AND p.created_at < $3 AND pl.gst_supply_type_snapshot = 'TAXABLE'
       GROUP BY pl.itc_status`,
      [actor.businessId, input.from, input.to],
    );

    const byStatus = new Map<string, GstItcSummary>();
    for (const row of rows) {
      byStatus.set(row.itc_status, {
        classification: row.itc_status as ItcClassification,
        cgstMinor: row.cgst_minor,
        sgstMinor: row.sgst_minor,
        igstMinor: row.igst_minor,
        cessMinor: row.cess_minor,
        totalMinor:
          row.cgst_minor + row.sgst_minor + row.igst_minor + row.cess_minor,
        lineCount: row.line_count,
      });
    }

    return [
      "ELIGIBLE",
      "INELIGIBLE",
      "BLOCKED",
      "UNASSESSED",
    ].map((status) => byStatus.get(status) ?? {
      classification: status as ItcClassification,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      cessMinor: 0,
      totalMinor: 0,
      lineCount: 0,
    });
  }


  async getGstNetLiability(
    actorId: string,
    value: GstRegisterInput,
  ): Promise<GstNetLiabilitySummary> {
    const actor = await this.authorize(actorId, "billing.read");
    const input = validationResult(gstRegisterSchema, value);

    const salesRows = await this.database.query<{
      cgst_minor: number;
      sgst_minor: number;
      igst_minor: number;
      cess_minor: number;
    }>(
      `SELECT coalesce(sum(il.cgst_minor),0) AS cgst_minor,
        coalesce(sum(il.sgst_minor),0) AS sgst_minor,
        coalesce(sum(il.igst_minor),0) AS igst_minor,
        coalesce(sum(il.cess_minor),0) AS cess_minor
       FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
       WHERE i.business_id = $1 AND i.created_at >= $2 AND i.created_at < $3 AND i.status = 'POSTED'`,
      [actor.businessId, input.from, input.to],
    );

    const itcRows = await this.database.query<{
      cgst_minor: number;
      sgst_minor: number;
      igst_minor: number;
      cess_minor: number;
    }>(
      `SELECT coalesce(sum(pl.input_cgst_minor),0) AS cgst_minor,
        coalesce(sum(pl.input_sgst_minor),0) AS sgst_minor,
        coalesce(sum(pl.input_igst_minor),0) AS igst_minor,
        coalesce(sum(pl.input_cess_minor),0) AS cess_minor
       FROM purchase_lines pl JOIN purchases p ON p.id = pl.purchase_id
       WHERE p.business_id = $1 AND p.created_at >= $2 AND p.created_at < $3 AND pl.itc_status = 'ELIGIBLE'`,
      [actor.businessId, input.from, input.to],
    );

    const sales = salesRows[0];
    const itc = itcRows[0];

    const outputCgst = sales?.cgst_minor ?? 0;
    const outputSgst = sales?.sgst_minor ?? 0;
    const outputIgst = sales?.igst_minor ?? 0;
    const outputCess = sales?.cess_minor ?? 0;
    const outputTotal = outputCgst + outputSgst + outputIgst + outputCess;

    const inputCgst = itc?.cgst_minor ?? 0;
    const inputSgst = itc?.sgst_minor ?? 0;
    const inputIgst = itc?.igst_minor ?? 0;
    const inputCess = itc?.cess_minor ?? 0;
    const inputTotal = inputCgst + inputSgst + inputIgst + inputCess;

    return {
      outputCgstMinor: outputCgst,
      outputSgstMinor: outputSgst,
      outputIgstMinor: outputIgst,
      outputCessMinor: outputCess,
      outputTotalMinor: outputTotal,
      inputCgstMinor: inputCgst,
      inputSgstMinor: inputSgst,
      inputIgstMinor: inputIgst,
      inputCessMinor: inputCess,
      inputTotalMinor: inputTotal,
      eligibleInputCgstMinor: inputCgst,
      eligibleInputSgstMinor: inputSgst,
      eligibleInputIgstMinor: inputIgst,
      eligibleInputCessMinor: inputCess,
      eligibleInputTotalMinor: inputTotal,
      netCgstMinor: Math.max(0, outputCgst - inputCgst),
      netSgstMinor: Math.max(0, outputSgst - inputSgst),
      netIgstMinor: Math.max(0, outputIgst - inputIgst),
      netCessMinor: Math.max(0, outputCess - inputCess),
      netPayableMinor: Math.max(0, outputTotal - inputTotal),
    };
  }

  async getInventoryValuation(actorId: string): Promise<InventoryValuation> {
    const actor = await this.authorize(actorId, "inventory.read");
    const rows = await this.database.query<{
      product_id: string;
      product_name: string;
      unit_name: string;
      unit_precision: number;
      quantity_delta_scaled: number;
      unit_cost_minor: number | null;
      occurred_at: string;
      movement_id: string;
    }>(
      `SELECT sm.product_id,p.name AS product_name,p.unit_name_snapshot AS unit_name,p.unit_precision_snapshot AS unit_precision,
        sm.quantity_delta_scaled,
        CASE WHEN sm.rowid <= (SELECT max_stock_movement_rowid FROM fifo_cost_migration_baseline WHERE id=1)
          AND sm.source_type IN ('RETURN','INVOICE_CANCELLATION') THEN NULL ELSE sm.unit_cost_minor END AS unit_cost_minor,
        sm.occurred_at,sm.id AS movement_id
       FROM stock_movements sm JOIN products p ON p.id=sm.product_id
       WHERE sm.business_id=$1 ORDER BY sm.product_id,sm.occurred_at,sm.rowid`,
      [actor.businessId],
    );
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = groups.get(row.product_id) ?? [];
      list.push(row);
      groups.set(row.product_id, list);
    }
    let knownValueMinor = 0,
      unknownQuantityScaled = 0;
    const products: InventoryValuation["products"] = [];
    for (const [productId, movements] of groups) {
      const first = movements[0];
      if (!first) continue;
      const totalOut = movements.reduce(
        (total, row) => total + Math.max(0, -row.quantity_delta_scaled),
        0,
      );
      let cumulativeIn = 0,
        onHandScaled = 0,
        known = 0,
        unknown = 0;
      for (const movement of movements) {
        onHandScaled += movement.quantity_delta_scaled;
        if (movement.quantity_delta_scaled <= 0) continue;
        cumulativeIn += movement.quantity_delta_scaled;
        const remaining = Math.min(
          movement.quantity_delta_scaled,
          Math.max(0, cumulativeIn - totalOut),
        );
        if (!remaining) continue;
        if (movement.unit_cost_minor === null) unknown += remaining;
        else
          known += roundedProduct(
            movement.unit_cost_minor,
            remaining,
            10 ** movement.unit_precision,
          );
      }
      if (![onHandScaled, known, unknown].every(Number.isSafeInteger))
        throw new AppError(
          "PERSISTENCE",
          "Inventory valuation exceeds the supported range.",
        );
      if (onHandScaled > 0)
        products.push({
          productId,
          productName: first.product_name,
          unitName: first.unit_name,
          unitPrecision: first.unit_precision,
          onHandScaled,
          knownValueMinor: known,
          unknownQuantityScaled: unknown,
        });
      knownValueMinor += known;
      unknownQuantityScaled += unknown;
    }
    products.sort((a, b) => a.productName.localeCompare(b.productName));
    if (
      !Number.isSafeInteger(knownValueMinor) ||
      !Number.isSafeInteger(unknownQuantityScaled)
    )
      throw new AppError(
        "PERSISTENCE",
        "Inventory valuation exceeds the supported range.",
      );
    return { method: "FIFO", knownValueMinor, unknownQuantityScaled, products };
  }

  async listCustomers(actorId: string, search = ""): Promise<CustomerRecord[]> {
    const actor = await this.authorize(actorId, "customers.read");
    const query = search.trim();
    return this.database
      .query<CustomerRow>(
        `SELECT id, name, phone, email, address, gstin, state_code, archived_at
         FROM customers WHERE business_id = $1 AND archived_at IS NULL
           AND ($2 = '' OR normalized_name LIKE $3 OR normalized_phone LIKE $3 OR lower(email) LIKE $3)
         ORDER BY normalized_name LIMIT 100`,
        [actor.businessId, query, `%${normalized(query)}%`],
      )
      .then((rows) => rows.map(mapCustomer));
  }

  async saveCustomer(
    actorId: string,
    value: CustomerInput,
    customerId?: string,
  ): Promise<CustomerRecord> {
    const actor = await this.authorize(actorId, "customers.manage");
    const input = validationResult(customerSchema, value);
    const now = this.runtime.now();
    const id = customerId ?? this.runtime.createId();
    if (customerId) {
      const current = await this.database.query<{ id: string }>(
        "SELECT id FROM customers WHERE id = $1 AND business_id = $2 AND archived_at IS NULL",
        [customerId, actor.businessId],
      );
      if (current.length === 0)
        throw new AppError("NOT_FOUND", "Customer not found.");
      await this.database.execute(
        `UPDATE customers SET name = $1, normalized_name = $2, phone = $3,
          normalized_phone = $4, email = $5, address = $6, updated_at = $7,
          gstin = $8,state_code = $9
         WHERE id = $10 AND business_id = $11`,
        [
          input.name,
          normalized(input.name),
          input.phone,
          normalized(input.phone),
          input.email,
          input.address,
          now,
          input.gstin ?? "",
          input.stateCode ?? "",
          id,
          actor.businessId,
        ],
      );
    } else {
      await this.database.execute(
        `INSERT INTO customers (
          id, business_id, name, normalized_name, phone, normalized_phone,
          email, address, created_at, updated_at, gstin, state_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11)`,
        [
          id,
          actor.businessId,
          input.name,
          normalized(input.name),
          input.phone,
          normalized(input.phone),
          input.email,
          input.address,
          now,
          input.gstin ?? "",
          input.stateCode ?? "",
        ],
      );
    }
    await this.database.execute(
      `INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
       VALUES ($1, $2, $3, $4, 'customer', $5, $6)`,
      [
        this.runtime.createId(),
        actor.businessId,
        actor.id,
        customerId ? "customer.updated" : "customer.created",
        id,
        now,
      ],
    );
    const rows = await this.database.query<CustomerRow>(
      `SELECT id, name, phone, email, address, gstin, state_code, archived_at
       FROM customers WHERE id = $1 AND business_id = $2`,
      [id, actor.businessId],
    );
    if (!rows[0])
      throw new AppError("PERSISTENCE", "Customer could not be read.");
    return mapCustomer(rows[0]);
  }

  async setCustomerArchived(
    actorId: string,
    customerId: string,
    archived: boolean,
  ): Promise<void> {
    const actor = await this.authorize(actorId, "customers.manage");
    const now = this.runtime.now();
    const result = await this.database.execute(
      `UPDATE customers SET archived_at = $1, updated_at = $2
       WHERE id = $3 AND business_id = $4`,
      [archived ? now : null, now, customerId, actor.businessId],
    );
    if (result.changes === 0)
      throw new AppError("NOT_FOUND", "Customer not found.");
    await this.database.execute(
      `INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
       VALUES ($1, $2, $3, $4, 'customer', $5, $6)`,
      [
        this.runtime.createId(),
        actor.businessId,
        actor.id,
        archived ? "customer.archived" : "customer.restored",
        customerId,
        now,
      ],
    );
  }

  async getCustomerPurchaseHistory(
    actorId: string,
    customerId: string,
  ): Promise<InvoiceRecord[]> {
    const actor = await this.authorize(actorId, "customers.read");
    const rows = await this.database.query<InvoiceRow>(
      `${this.invoiceSelect()}
       WHERE i.business_id = $1 AND i.customer_id = $2 AND i.status <> 'DRAFT'
       ORDER BY i.created_at DESC LIMIT 100`,
      [actor.businessId, customerId],
    );
    return Promise.all(rows.map((row) => this.readInvoice(actor, row)));
  }

  async getCustomerSalesSummary(
    actorId: string,
    customerId: string,
  ): Promise<CustomerSalesSummary> {
    const actor = await this.authorize(actorId, "customers.read");
    const customer = await this.database.query<{ id: string }>(
      "SELECT id FROM customers WHERE id = $1 AND business_id = $2",
      [customerId, actor.businessId],
    );
    if (!customer[0]) throw new AppError("NOT_FOUND", "Customer not found.");
    const rows = await this.database.query<{
      invoice_count: number;
      gross_sales_minor: number;
      net_paid_minor: number;
    }>(
      `SELECT count(i.id) AS invoice_count,
        coalesce(sum(i.total_minor), 0) AS gross_sales_minor,
        coalesce(sum((SELECT sum(p.amount_minor) FROM payments p
          WHERE p.invoice_id = i.id)), 0) AS net_paid_minor
       FROM invoices i
       WHERE i.business_id = $1 AND i.customer_id = $2 AND i.status = 'POSTED'`,
      [actor.businessId, customerId],
    );
    const row = rows[0];
    if (!row)
      throw new AppError("PERSISTENCE", "Sales summary is unavailable.");
    if (
      !Number.isSafeInteger(row.invoice_count) ||
      !Number.isSafeInteger(row.gross_sales_minor) ||
      !Number.isSafeInteger(row.net_paid_minor)
    )
      throw new AppError(
        "PERSISTENCE",
        "Customer sales totals exceed the supported range.",
      );
    const returnedLines = await this.database.query<{
      line_total_minor: number;
      quantity_scaled: number;
      returned_quantity_scaled: number;
    }>(
      `SELECT il.line_total_minor, il.quantity_scaled,
        sum(irl.quantity_scaled) AS returned_quantity_scaled
       FROM invoice_return_lines irl
       JOIN invoice_returns r ON r.id = irl.return_id
       JOIN invoice_lines il ON il.id = irl.invoice_line_id
       JOIN invoices i ON i.id = r.invoice_id
       WHERE i.business_id = $1 AND i.customer_id = $2 AND i.status = 'POSTED'
       GROUP BY il.id`,
      [actor.businessId, customerId],
    );
    const returnedMinor = returnedLines.reduce((sum, line) => {
      if (
        !Number.isSafeInteger(line.line_total_minor) ||
        !Number.isSafeInteger(line.quantity_scaled) ||
        !Number.isSafeInteger(line.returned_quantity_scaled) ||
        line.returned_quantity_scaled > line.quantity_scaled
      )
        throw new AppError(
          "PERSISTENCE",
          "Returned customer sales data is inconsistent.",
        );
      const lineReturnedMinor = roundedProduct(
        line.line_total_minor,
        line.returned_quantity_scaled,
        line.quantity_scaled,
      );
      const total = sum + lineReturnedMinor;
      if (!Number.isSafeInteger(total))
        throw new AppError(
          "PERSISTENCE",
          "Customer sales totals exceed the supported range.",
        );
      return total;
    }, 0);
    if (returnedMinor > row.gross_sales_minor)
      throw new AppError(
        "PERSISTENCE",
        "Returned value exceeds customer sales.",
      );
    const netSalesMinor = row.gross_sales_minor - returnedMinor;
    const netPaidMinor = row.net_paid_minor;
    return {
      invoiceCount: row.invoice_count,
      netSalesMinor,
      netPaidMinor,
      outstandingMinor: Math.max(0, netSalesMinor - netPaidMinor),
    };
  }

  async listStockBalances(
    actorId: string,
    options: { search?: string; lowStockOnly?: boolean } = {},
  ): Promise<StockBalanceRecord[]> {
    const actor = await this.authorize(actorId, "inventory.read");
    const rows = await this.database.query<{
      product_id: string;
      name: string;
      sku: string;
      unit_name_snapshot: string;
      unit_precision_snapshot: number;
      on_hand_scaled: number;
      reorder_threshold_scaled: number;
    }>(
      `SELECT p.id AS product_id, p.name, p.sku, p.unit_name_snapshot,
        p.unit_precision_snapshot,
        coalesce(sum(sm.quantity_delta_scaled), 0) AS on_hand_scaled,
        p.reorder_threshold_scaled
       FROM products p LEFT JOIN stock_movements sm
         ON sm.product_id = p.id AND sm.business_id = p.business_id
       WHERE p.business_id = $1 AND p.archived_at IS NULL AND p.is_active = 1
         AND ($2 = '' OR lower(p.name) LIKE $3 OR p.normalized_sku LIKE $3 OR EXISTS (
           SELECT 1 FROM barcode_mappings bm WHERE bm.product_id = p.id AND bm.business_id = p.business_id AND bm.value LIKE $3
         ))
       GROUP BY p.id
       HAVING ($4 = 0 OR on_hand_scaled <= p.reorder_threshold_scaled)
       ORDER BY lower(p.name)`,
      [
        actor.businessId,
        options.search?.trim() ?? "",
        `%${normalized(options.search ?? "")}%`,
        options.lowStockOnly ? 1 : 0,
      ],
    );
    return rows.map((row) => {
      if (
        !Number.isSafeInteger(row.on_hand_scaled) ||
        !Number.isSafeInteger(row.reorder_threshold_scaled)
      )
        throw new AppError(
          "PERSISTENCE",
          "A stored stock balance exceeds the supported range.",
        );
      return {
        productId: row.product_id,
        productName: row.name,
        sku: row.sku,
        unitName: row.unit_name_snapshot,
        unitPrecision: row.unit_precision_snapshot,
        onHandScaled: row.on_hand_scaled,
        reorderThresholdScaled: row.reorder_threshold_scaled,
        lowStock: row.on_hand_scaled <= row.reorder_threshold_scaled,
      };
    });
  }

  async recordStockMovement(
    actorId: string,
    value: StockMovementInput,
  ): Promise<StockBalanceRecord> {
    const actor = await this.authorize(actorId, "inventory.manage");
    const input = validationResult(stockMovementSchema, value);
    const product = await this.readProduct(actor.businessId, input.productId);
    if (!product || product.archivedAt || !product.isActive)
      throw new AppError(
        "NOT_FOUND",
        "An active product is required for stock changes.",
      );
    const raw = input.quantity.trim();
    const negativeAdjustment =
      input.movementType === "ADJUSTMENT" && raw.startsWith("-");
    const quantity = parseQuantityToScaledInteger(
      negativeAdjustment ? raw.slice(1) : raw,
      product.unitPrecision,
    );
    if (quantity <= 0)
      throw new AppError(
        "VALIDATION",
        "Stock quantity must be greater than zero.",
      );
    const quantityDelta =
      input.movementType === "MANUAL_OUT" ||
      input.movementType === "PURCHASE_RETURN" ||
      negativeAdjustment
        ? -quantity
        : quantity;
    const unitCostMinor = input.unitCost
      ? parseMoneyToMinorUnits(
          input.unitCost,
          (await this.getBusiness(actorId)).currencyFractionDigits,
        )
      : null;
    const prior = await this.database.query<{
      product_id: string;
      movement_type: StockMovementRecord["movementType"];
      quantity_delta_scaled: number;
      unit_cost_minor: number | null;
      reason: string;
    }>(
      `SELECT product_id, movement_type, quantity_delta_scaled, unit_cost_minor, reason
         FROM stock_movements WHERE business_id = $1 AND idempotency_key = $2`,
      [actor.businessId, input.idempotencyKey],
    );
    if (prior[0]) {
      if (
        prior[0].product_id !== input.productId ||
        prior[0].movement_type !== input.movementType ||
        prior[0].quantity_delta_scaled !== quantityDelta ||
        prior[0].unit_cost_minor !== unitCostMinor ||
        prior[0].reason !== input.reason
      )
        throw new AppError(
          "CONFLICT",
          "This stock request key was already used for different movement details.",
        );
      const balances = await this.listStockBalances(actorId);
      const found = balances.find(
        (balance) => balance.productId === input.productId,
      );
      if (!found) throw new AppError("NOT_FOUND", "Product not found.");
      return found;
    }
    if (input.movementType === "OPENING") {
      const current = await this.currentStock(
        actor.businessId,
        input.productId,
      );
      if (current !== 0)
        throw new AppError(
          "CONFLICT",
          "Opening stock can only be recorded before other movements.",
        );
    }
    try {
      await this.database.execute(
        `INSERT INTO stock_movements (
          id, business_id, product_id, actor_user_id, movement_type,
          quantity_delta_scaled, unit_cost_minor, source_type, source_id,
          reason, occurred_at, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'MANUAL', NULL, $8, $9, $10)`,
        [
          this.runtime.createId(),
          actor.businessId,
          input.productId,
          actor.id,
          input.movementType,
          quantityDelta,
          unitCostMinor,
          input.reason,
          this.runtime.now(),
          input.idempotencyKey,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) {
        const duplicate = await this.database.query<{
          product_id: string;
          movement_type: StockMovementRecord["movementType"];
          quantity_delta_scaled: number;
          unit_cost_minor: number | null;
          reason: string;
        }>(
          `SELECT product_id, movement_type, quantity_delta_scaled, unit_cost_minor, reason
           FROM stock_movements WHERE business_id = $1 AND idempotency_key = $2`,
          [actor.businessId, input.idempotencyKey],
        );
        if (duplicate[0]) {
          if (
            duplicate[0].product_id !== input.productId ||
            duplicate[0].movement_type !== input.movementType ||
            duplicate[0].quantity_delta_scaled !== quantityDelta ||
            duplicate[0].unit_cost_minor !== unitCostMinor ||
            duplicate[0].reason !== input.reason
          )
            throw new AppError(
              "CONFLICT",
              "The stock request key is already in use.",
            );
          const balances = await this.listStockBalances(actorId);
          const found = balances.find(
            (balance) => balance.productId === input.productId,
          );
          if (!found) throw new AppError("NOT_FOUND", "Product not found.");
          return found;
        }
        throw persistenceConflict(error);
      }
      throw error;
    }
    const balances = await this.listStockBalances(actorId);
    const balance = balances.find((item) => item.productId === input.productId);
    if (!balance) throw new AppError("NOT_FOUND", "Product not found.");
    return balance;
  }

  async listStockMovements(
    actorId: string,
    productId: string,
  ): Promise<StockMovementRecord[]> {
    const actor = await this.authorize(actorId, "inventory.read");
    const rows = await this.database.query<{
      id: string;
      product_id: string;
      product_name: string;
      movement_type: StockMovementRecord["movementType"];
      quantity_delta_scaled: number;
      source_type: string;
      source_id: string | null;
      reason: string;
      occurred_at: string;
      actor_name: string;
      balance_after_scaled: number;
    }>(
      `SELECT sm.id, sm.product_id, p.name AS product_name, sm.movement_type,
        sm.quantity_delta_scaled, sm.source_type, sm.source_id, sm.reason,
        sm.occurred_at, u.display_name AS actor_name,
        sum(sm.quantity_delta_scaled) OVER (
          PARTITION BY sm.product_id ORDER BY sm.occurred_at, sm.id
        ) AS balance_after_scaled
       FROM stock_movements sm JOIN products p ON p.id = sm.product_id
       JOIN users u ON u.id = sm.actor_user_id
       WHERE sm.business_id = $1 AND sm.product_id = $2
       ORDER BY sm.occurred_at DESC, sm.id DESC`,
      [actor.businessId, productId],
    );
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      movementType: row.movement_type,
      quantityDeltaScaled: row.quantity_delta_scaled,
      sourceType: row.source_type,
      sourceId: row.source_id,
      reason: row.reason,
      occurredAt: row.occurred_at,
      actorName: row.actor_name,
      balanceAfterScaled: row.balance_after_scaled,
    }));
  }

  async setTaxRate(actorId: string, value: TaxRateInput): Promise<void> {
    const actor = await this.authorize(actorId, "tax.manage");
    const input = validationResult(taxRateSchema, value);
    await this.database.execute(
      `INSERT INTO tax_rates (
        id, business_id, category_code, rate_basis_points, effective_at,
        created_by, reason, created_at, cess_rate_basis_points, source_reference
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        this.runtime.createId(),
        actor.businessId,
        normalized(input.categoryCode),
        input.rateBasisPoints,
        input.effectiveAt,
        actor.id,
        input.reason,
        this.runtime.now(),
        input.cessRateBasisPoints,
        input.sourceReference,
      ],
    );
    await this.database.execute(
      `INSERT INTO audit_events (id, business_id, actor_user_id, action, entity_type, entity_id, occurred_at)
       VALUES ($1, $2, $3, 'tax.rate_created', 'tax_rate', $4, $5)`,
      [
        this.runtime.createId(),
        actor.businessId,
        actor.id,
        input.categoryCode,
        this.runtime.now(),
      ],
    );
  }

  async listTaxRates(actorId: string): Promise<TaxRateRecord[]> {
    const actor = await this.authorize(actorId, "tax.manage");
    const rows = await this.database.query<{
      id: string;
      category_code: string;
      rate_basis_points: number;
      cess_rate_basis_points: number;
      effective_at: string;
      source_reference: string;
      reason: string;
    }>(
      `SELECT id,category_code,rate_basis_points,cess_rate_basis_points,
        effective_at,source_reference,reason
       FROM tax_rates WHERE business_id=$1 ORDER BY effective_at DESC,created_at DESC`,
      [actor.businessId],
    );
    return rows.map((row) => ({
      id: row.id,
      categoryCode: row.category_code,
      rateBasisPoints: row.rate_basis_points,
      cessRateBasisPoints: row.cess_rate_basis_points,
      effectiveAt: row.effective_at,
      sourceReference: row.source_reference,
      reason: row.reason,
    }));
  }

  async createInvoiceDraft(
    actorId: string,
    value: InvoiceDraftInput,
  ): Promise<InvoiceRecord> {
    const actor = await this.authorize(actorId, "billing.create");
    const input = validationResult(invoiceDraftSchema, value);
    const fingerprint = JSON.stringify(input);
    const existing = await this.database.query<{
      id: string;
      request_fingerprint: string;
    }>(
      "SELECT id, request_fingerprint FROM invoices WHERE business_id = $1 AND idempotency_key = $2",
      [actor.businessId, input.idempotencyKey],
    );
    if (existing[0]) {
      if (existing[0].request_fingerprint !== fingerprint)
        throw new AppError(
          "CONFLICT",
          "This invoice request key was already used with different items.",
        );
      return this.getInvoice(actorId, existing[0].id);
    }
    const business = await this.getBusiness(actorId);
    let customer = {
      name: "Walk-in",
      gstin: "",
      address: "",
      stateCode: "",
    };
    if (input.customerId) {
      const customerRows = await this.database.query<{
        id: string;
        name: string;
        gstin: string;
        address: string;
        state_code: string;
      }>(
        `SELECT id,name,gstin,address,state_code FROM customers
         WHERE id=$1 AND business_id=$2 AND archived_at IS NULL`,
        [input.customerId, actor.businessId],
      );
      const selectedCustomer = customerRows[0];
      if (!selectedCustomer)
        throw new AppError(
          "NOT_FOUND",
          "Choose an active customer or Walk-in.",
        );
      customer = {
        name: selectedCustomer.name,
        gstin: selectedCustomer.gstin,
        address: selectedCustomer.address,
        stateCode: selectedCustomer.state_code,
      };
    }
    const registered =
      business.gstRegistrationType === "REGULAR" ||
      business.gstRegistrationType === "COMPOSITION";
    if (business.taxEnabled && business.gstRegistrationType !== "REGULAR")
      throw new AppError(
        "VALIDATION",
        "GST sales calculations require a configured regular GST registration.",
      );
    if (business.gstRegistrationType === "REGULAR" && !business.taxEnabled)
      throw new AppError(
        "VALIDATION",
        "Enable GST calculation before issuing documents for a regular GST registration.",
      );
    if (registered) {
      if (
        !hasValidGstinStructure(business.taxRegistrationId ?? "") ||
        !/^\d{2}$/.test(business.gstStateCode) ||
        !business.gstRegisteredAddress.trim()
      )
        throw new AppError(
          "VALIDATION",
          "Complete the business GSTIN, state and registered address before issuing GST documents.",
        );
      if (!/^\d{2}$/.test(input.placeOfSupplyStateCode ?? ""))
        throw new AppError(
          "VALIDATION",
          "Enter the actual two-digit place-of-supply state code for this sale.",
          "placeOfSupplyStateCode",
        );
    }
    const placeOfSupplyStateCode = input.placeOfSupplyStateCode ?? "";
    const prepared: Array<{
      id: string;
      product: ProductRecord;
      quantityScaled: number;
      unitPriceMinor: number;
      discountMinor: number;
      taxRate: number;
      cessRate: number;
      subtotalMinor: number;
      taxableValueMinor: number;
      taxMinor: number;
      cgstMinor: number;
      sgstMinor: number;
      igstMinor: number;
      cessMinor: number;
      totalMinor: number;
    }> = [];
    for (const requested of input.lines) {
      const product = await this.readProduct(
        actor.businessId,
        requested.productId,
      );
      if (!product || product.archivedAt || !product.isActive)
        throw new AppError(
          "NOT_FOUND",
          "An active product is required for an invoice.",
        );
      const quantityScaled = parseQuantityToScaledInteger(
        requested.quantity,
        product.unitPrecision,
      );
      if (quantityScaled <= 0)
        throw new AppError(
          "VALIDATION",
          "Invoice quantity must be greater than zero.",
        );
      const subtotalMinor = roundedProduct(
        product.sellingPriceMinor,
        quantityScaled,
        10 ** product.unitPrecision,
      );
      const discountMinor = parseMoneyToMinorUnits(
        requested.discount,
        business.currencyFractionDigits,
      );
      if (discountMinor > subtotalMinor)
        throw new AppError(
          "VALIDATION",
          "A line discount cannot exceed its subtotal.",
        );
      let taxRate = 0;
      let cessRate = 0;
      if (business.taxEnabled && product.gstSupplyType === "TAXABLE") {
        if (!product.taxCategory.trim())
          throw new AppError(
            "VALIDATION",
            `Set a tax category for ${product.name} before billing with tax enabled.`,
          );
        if (!product.hsnSacCode.trim())
          throw new AppError(
            "VALIDATION",
            `Set an HSN/SAC code for ${product.name} before billing.`,
          );
        const rates = await this.database.query<{
          rate_basis_points: number;
          cess_rate_basis_points: number;
          source_reference: string;
        }>(
          `SELECT rate_basis_points,cess_rate_basis_points,source_reference FROM tax_rates
           WHERE business_id = $1 AND category_code = $2 AND effective_at <= $3
           ORDER BY effective_at DESC, created_at DESC LIMIT 1`,
          [
            actor.businessId,
            normalized(product.taxCategory),
            this.runtime.now(),
          ],
        );
        if (!rates[0])
          throw new AppError(
            "VALIDATION",
            `Configure an effective tax rate for ${product.taxCategory} before billing.`,
          );
        if (!rates[0].source_reference.trim())
          throw new AppError(
            "VALIDATION",
            `Add an authoritative source reference to the ${product.taxCategory} rate before GST billing.`,
          );
        taxRate = rates[0].rate_basis_points;
        cessRate = rates[0].cess_rate_basis_points;
      }
      const gstLine = business.taxEnabled
        ? calculateGstLine({
            amountMinor: subtotalMinor,
            discountMinor,
            supplyType: product.gstSupplyType,
            pricingMode: product.gstPricingMode,
            gstRateBasisPoints: taxRate,
            cessRateBasisPoints: cessRate,
            supplierStateCode: business.gstStateCode,
            placeOfSupplyStateCode,
          })
        : {
            taxableValueMinor: subtotalMinor - discountMinor,
            totalTaxMinor: 0,
            cgstMinor: 0,
            sgstMinor: 0,
            igstMinor: 0,
            cessMinor: 0,
            totalMinor: subtotalMinor - discountMinor,
          };
      prepared.push({
        id: this.runtime.createId(),
        product,
        quantityScaled,
        unitPriceMinor: product.sellingPriceMinor,
        discountMinor,
        taxRate,
        cessRate,
        subtotalMinor,
        taxableValueMinor: gstLine.taxableValueMinor,
        taxMinor: gstLine.totalTaxMinor,
        cgstMinor: gstLine.cgstMinor,
        sgstMinor: gstLine.sgstMinor,
        igstMinor: gstLine.igstMinor,
        cessMinor: gstLine.cessMinor,
        totalMinor: gstLine.totalMinor,
      });
    }
    const subtotalMinor = prepared.reduce(
      (sum, line) => sum + line.subtotalMinor,
      0,
    );
    const discountMinor = prepared.reduce(
      (sum, line) => sum + line.discountMinor,
      0,
    );
    const taxMinor = prepared.reduce((sum, line) => sum + line.taxMinor, 0);
    const totalMinor = prepared.reduce((sum, line) => sum + line.totalMinor, 0);
    for (const amount of [subtotalMinor, discountMinor, taxMinor, totalMinor]) {
      if (!Number.isSafeInteger(amount))
        throw new AppError(
          "VALIDATION",
          "Invoice total exceeds the supported range.",
        );
    }
    const id = this.runtime.createId();
    const now = this.runtime.now();
    const hasTaxable = prepared.some(
      (line) => line.product.gstSupplyType === "TAXABLE",
    );
    const hasExemptOrNil = prepared.some((line) =>
      ["EXEMPT", "NIL_RATED"].includes(line.product.gstSupplyType),
    );
    const hasNonGst = prepared.some(
      (line) => line.product.gstSupplyType === "NON_GST",
    );
    let documentType: InvoiceRecord["documentType"] = "RETAIL_RECEIPT";
    if (business.gstRegistrationType === "COMPOSITION") {
      documentType = "BILL_OF_SUPPLY";
    } else if (business.gstRegistrationType === "REGULAR") {
      if (hasTaxable && (hasExemptOrNil || hasNonGst)) {
        if (hasNonGst || customer.gstin)
          throw new AppError(
            "VALIDATION",
            "Split taxable and non-GST or registered-recipient supplies into separate documents.",
          );
        documentType = "INVOICE_CUM_BILL_OF_SUPPLY";
      } else if (hasTaxable) {
        documentType = "TAX_INVOICE";
      } else {
        documentType = "BILL_OF_SUPPLY";
      }
    }
    let financialYear = "";
    let invoiceNumber = `${business.invoicePrefix}-${now.slice(0, 10).replaceAll("-", "")}-${id}`;
    if (registered) {
      financialYear = financialYearLabel(
        now,
        business.timezone,
        business.gstFinancialYearStartMonth,
      );
      const sequenceRows = await this.database.query<{
        last_sequence: number;
      }>(
        `INSERT INTO gst_invoice_sequences(business_id,financial_year,last_sequence)
         VALUES($1,$2,1)
         ON CONFLICT(business_id,financial_year)
         DO UPDATE SET last_sequence=last_sequence+1
         RETURNING last_sequence`,
        [business.id, financialYear],
      );
      const sequence = sequenceRows[0]?.last_sequence;
      if (!sequence || !Number.isSafeInteger(sequence))
        throw new AppError(
          "PERSISTENCE",
          "GST invoice sequence could not be allocated.",
        );
      const yearMarker = `${financialYear.slice(2, 4)}${financialYear.slice(5, 7)}`;
      invoiceNumber = `${business.gstInvoicePrefix}${yearMarker}/${sequence.toString(36).toUpperCase().padStart(6, "0")}`;
      if (invoiceNumber.length > 16)
        throw new AppError(
          "CONFLICT",
          "GST invoice series reached the 16-character document number limit.",
        );
    }
    const draftLines = JSON.stringify(
      prepared.map((line) => ({
        id: line.id,
        productId: line.product.id,
        productName: line.product.name,
        sku: line.product.sku,
        barcode: line.product.activeBarcode,
        unitName: line.product.unitName,
        unitPrecision: line.product.unitPrecision,
        quantityScaled: line.quantityScaled,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        taxRate: line.taxRate,
        hsnSacCode: line.product.hsnSacCode,
        gstSupplyType: line.product.gstSupplyType,
        gstPricingMode: line.product.gstPricingMode,
        subtotalMinor: line.subtotalMinor,
        gstTaxableValueMinor: line.taxableValueMinor,
        taxMinor: line.taxMinor,
        cgstMinor: line.cgstMinor,
        sgstMinor: line.sgstMinor,
        igstMinor: line.igstMinor,
        cessRateBasisPoints: line.cessRate,
        cessMinor: line.cessMinor,
        totalMinor: line.totalMinor,
      })),
    );
    try {
      await this.database.execute(
        `INSERT INTO invoices (
          id, business_id, customer_id, invoice_number, status, subtotal_minor,
          discount_minor, tax_minor, total_minor, idempotency_key, request_fingerprint,
          draft_lines_json, actor_user_id, created_at,gst_document_type,
          customer_gstin_snapshot,customer_name_snapshot,customer_address_snapshot,
          customer_state_code_snapshot,supplier_gstin_snapshot,supplier_legal_name_snapshot,
          supplier_trade_name_snapshot,supplier_address_snapshot,supplier_state_code_snapshot,
          place_of_supply_state_code,reverse_charge,financial_year_snapshot
        ) VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$11,$12,$13,
          $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,0,$25)`,
        [
          id,
          actor.businessId,
          input.customerId,
          invoiceNumber,
          subtotalMinor,
          discountMinor,
          taxMinor,
          totalMinor,
          input.idempotencyKey,
          fingerprint,
          draftLines,
          actor.id,
          now,
          documentType,
          customer.gstin,
          customer.name,
          customer.address,
          customer.stateCode,
          business.taxRegistrationId ?? "",
          business.legalName,
          business.gstTradeName,
          business.gstRegisteredAddress || business.address,
          business.gstStateCode,
          placeOfSupplyStateCode,
          financialYear,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) {
        const duplicate = await this.database.query<{
          id: string;
          request_fingerprint: string;
        }>(
          "SELECT id, request_fingerprint FROM invoices WHERE business_id = $1 AND idempotency_key = $2",
          [actor.businessId, input.idempotencyKey],
        );
        if (duplicate[0]) {
          if (duplicate[0].request_fingerprint !== fingerprint)
            throw new AppError(
              "CONFLICT",
              "This invoice request key was already used with different items.",
            );
          return this.getInvoice(actorId, duplicate[0].id);
        }
        throw persistenceConflict(error);
      }
      throw error;
    }
    return this.getInvoice(actorId, id);
  }

  async postInvoice(
    actorId: string,
    invoiceId: string,
  ): Promise<InvoiceRecord> {
    const actor = await this.authorize(actorId, "billing.create");
    const invoice = await this.database.query<{ status: string }>(
      "SELECT status FROM invoices WHERE id = $1 AND business_id = $2",
      [invoiceId, actor.businessId],
    );
    if (invoice.length === 0)
      throw new AppError("NOT_FOUND", "Invoice not found.");
    if (invoice[0]?.status === "POSTED")
      return this.getInvoice(actorId, invoiceId);
    if (invoice[0]?.status !== "DRAFT")
      throw new AppError("CONFLICT", "Only a draft invoice can be posted.");
    try {
      await this.database.execute(
        `UPDATE invoices SET status = 'POSTED', posted_at = $1
         WHERE id = $2 AND business_id = $3 AND status = 'DRAFT'`,
        [this.runtime.now(), invoiceId, actor.businessId],
      );
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
    return this.getInvoice(actorId, invoiceId);
  }

  async addInvoicePayment(
    actorId: string,
    invoiceId: string,
    value: PaymentInput,
  ): Promise<InvoiceRecord> {
    const actor = await this.authorize(actorId, "billing.create");
    const input = validationResult(paymentSchema, value);
    const invoice = await this.database.query<{ id: string; status: string }>(
      "SELECT id, status FROM invoices WHERE id = $1 AND business_id = $2",
      [invoiceId, actor.businessId],
    );
    if (!invoice[0] || invoice[0].status !== "POSTED")
      throw new AppError(
        "CONFLICT",
        "Payments can only be recorded for posted invoices.",
      );
    const amountMinor = parseMoneyToMinorUnits(
      input.amount,
      (await this.getBusiness(actorId)).currencyFractionDigits,
    );
    if (amountMinor <= 0)
      throw new AppError("VALIDATION", "Payment must be greater than zero.");
    const prior = await this.database.query<{
      invoice_id: string;
      payment_type: string;
      amount_minor: number;
      reference: string;
    }>(
      "SELECT invoice_id, payment_type, amount_minor, reference FROM payments WHERE business_id = $1 AND idempotency_key = $2",
      [actor.businessId, input.idempotencyKey],
    );
    if (prior[0]) {
      if (
        prior[0].invoice_id !== invoiceId ||
        prior[0].payment_type !== input.method ||
        prior[0].amount_minor !== amountMinor ||
        prior[0].reference !== input.reference
      )
        throw new AppError(
          "CONFLICT",
          "This payment request key was already used for different payment details.",
        );
      return this.getInvoice(actorId, invoiceId);
    }
    try {
      await this.database.execute(
        `INSERT INTO payments (
          id, business_id, invoice_id, actor_user_id, payment_type, amount_minor,
          reference, idempotency_key, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          this.runtime.createId(),
          actor.businessId,
          invoiceId,
          actor.id,
          input.method,
          amountMinor,
          input.reference,
          input.idempotencyKey,
          this.runtime.now(),
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) {
        const duplicate = await this.database.query<{
          invoice_id: string;
          payment_type: string;
          amount_minor: number;
          reference: string;
        }>(
          "SELECT invoice_id, payment_type, amount_minor, reference FROM payments WHERE business_id = $1 AND idempotency_key = $2",
          [actor.businessId, input.idempotencyKey],
        );
        if (duplicate[0]) {
          if (
            duplicate[0].invoice_id !== invoiceId ||
            duplicate[0].payment_type !== input.method ||
            duplicate[0].amount_minor !== amountMinor ||
            duplicate[0].reference !== input.reference
          )
            throw new AppError(
              "CONFLICT",
              "This payment request key was already used for different payment details.",
            );
          return this.getInvoice(actorId, invoiceId);
        }
        throw persistenceConflict(error);
      }
      throw error;
    }
    return this.getInvoice(actorId, invoiceId);
  }

  async getSalesReport(
    actorId: string,
    value: SalesReportInput,
  ): Promise<SalesReport> {
    const actor = await this.authorize(actorId, "billing.read");
    const input = validationResult(salesReportSchema, value);
    if (Date.parse(input.from) >= Date.parse(input.to))
      throw new AppError(
        "VALIDATION",
        "The report end must be after its start.",
      );
    const groupBy = input.groupBy ?? "day";
    const [summaryRows, lineRows, cancelledRows, postedRows] =
      await Promise.all([
        this.database.query<{
          invoice_count: number;
          gross_sales_minor: number;
          net_payments_minor: number;
        }>(
          `SELECT count(*) AS invoice_count, coalesce(sum(i.total_minor),0) AS gross_sales_minor,
          coalesce(sum((SELECT coalesce(sum(p.amount_minor),0) FROM payments p WHERE p.invoice_id=i.id)),0) AS net_payments_minor
         FROM invoices i WHERE i.business_id=$1 AND i.status='POSTED' AND i.posted_at >= $2 AND i.posted_at < $3`,
          [actor.businessId, input.from, input.to],
        ),
        this.database.query<{
          invoice_id: string;
          posted_at: string;
          product_id: string;
          product_name: string;
          sku: string;
          category_name: string;
          quantity_scaled: number;
          line_total_minor: number;
          line_subtotal_minor: number;
          cost_minor: number | null;
          unknown_quantity_scaled: number;
          restocked_cost_minor: number;
          restocked_unknown_quantity_scaled: number;
          cost_layer_quantity_scaled: number;
          returned_quantity_scaled: number;
          restocked_quantity_scaled: number;
        }>(
          `SELECT i.id AS invoice_id,i.posted_at,il.id,il.product_id,il.product_name_snapshot AS product_name,il.sku_snapshot AS sku,
          coalesce(c.name,'Uncategorized') AS category_name,il.quantity_scaled,il.line_total_minor,il.line_subtotal_minor,
          CASE WHEN coalesce((SELECT sum(l.quantity_scaled) FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id),0)=il.quantity_scaled THEN
            (SELECT sum(CASE WHEN l.unit_cost_minor IS NULL THEN 0 ELSE
              (l.quantity_scaled*l.unit_cost_minor + CASE il.unit_precision WHEN 0 THEN 0 WHEN 1 THEN 5 WHEN 2 THEN 50 WHEN 3 THEN 500 WHEN 4 THEN 5000 WHEN 5 THEN 50000 ELSE 500000 END) /
              CASE il.unit_precision WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END END)
             FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id) ELSE NULL END AS cost_minor,
          CASE WHEN coalesce((SELECT sum(l.quantity_scaled) FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id),0)=il.quantity_scaled THEN
            coalesce((SELECT sum(l.quantity_scaled) FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id AND l.unit_cost_minor IS NULL),0)
            ELSE il.quantity_scaled END AS unknown_quantity_scaled,
          coalesce((SELECT sum(CASE WHEN l.unit_cost_minor IS NULL THEN 0 ELSE
            (l.quantity_scaled*l.unit_cost_minor + CASE il.unit_precision WHEN 0 THEN 0 WHEN 1 THEN 5 WHEN 2 THEN 50 WHEN 3 THEN 500 WHEN 4 THEN 5000 WHEN 5 THEN 50000 ELSE 500000 END) /
            CASE il.unit_precision WHEN 0 THEN 1 WHEN 1 THEN 10 WHEN 2 THEN 100 WHEN 3 THEN 1000 WHEN 4 THEN 10000 WHEN 5 THEN 100000 ELSE 1000000 END END)
            FROM invoice_return_cost_layers l WHERE l.invoice_line_id=il.id AND l.unit_cost_minor IS NOT NULL),0) AS restocked_cost_minor,
          coalesce((SELECT sum(l.quantity_scaled) FROM invoice_return_cost_layers l WHERE l.invoice_line_id=il.id AND l.unit_cost_minor IS NULL),0) AS restocked_unknown_quantity_scaled,
          coalesce((SELECT sum(l.quantity_scaled) FROM invoice_line_cost_layers l WHERE l.invoice_line_id=il.id),0) AS cost_layer_quantity_scaled,
          coalesce((SELECT sum(irl.quantity_scaled) FROM invoice_return_lines irl
            JOIN invoice_returns r ON r.id=irl.return_id WHERE irl.invoice_line_id=il.id),0) AS returned_quantity_scaled,
          coalesce((SELECT sum(irl.quantity_scaled) FROM invoice_return_lines irl
            WHERE irl.invoice_line_id=il.id AND irl.disposition='RESTOCK'),0) AS restocked_quantity_scaled
         FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
         JOIN products p ON p.id=il.product_id LEFT JOIN categories c ON c.id=p.category_id
         WHERE i.business_id=$1 AND i.status='POSTED' AND i.posted_at >= $2 AND i.posted_at < $3`,
          [actor.businessId, input.from, input.to],
        ),
        this.database.query<{ cancelled_at: string }>(
          "SELECT cancelled_at FROM invoices WHERE business_id=$1 AND status='CANCELLED' AND cancelled_at >= $2 AND cancelled_at < $3",
          [actor.businessId, input.from, input.to],
        ),
        this.database.query<{
          id: string;
          posted_at: string;
          total_minor: number;
          net_payments_minor: number;
        }>(
          "SELECT i.id,i.posted_at,i.total_minor,coalesce((SELECT sum(p.amount_minor) FROM payments p WHERE p.invoice_id=i.id),0) AS net_payments_minor FROM invoices i WHERE i.business_id=$1 AND i.status='POSTED' AND i.posted_at >= $2 AND i.posted_at < $3",
          [actor.businessId, input.from, input.to],
        ),
      ]);
    const summary = summaryRows[0];
    if (!summary)
      throw new AppError("PERSISTENCE", "Sales report is unavailable.");
    const productsById = new Map<string, SalesReport["products"][number]>();
    let returnedMinor = 0;
    let netSubtotalMinor = 0;
    let costOfGoodsMinor = 0;
    let unknownCostLineCount = 0;
    const returnedByInvoice = new Map<string, number>();
    for (const row of lineRows) {
      if (
        ![
          row.quantity_scaled,
          row.line_total_minor,
          row.line_subtotal_minor,
          row.returned_quantity_scaled,
          row.restocked_quantity_scaled,
          row.unknown_quantity_scaled,
          row.restocked_cost_minor,
          row.restocked_unknown_quantity_scaled,
          row.cost_layer_quantity_scaled,
        ].every(Number.isSafeInteger) ||
        row.returned_quantity_scaled > row.quantity_scaled ||
        row.restocked_quantity_scaled > row.returned_quantity_scaled
      )
        throw new AppError(
          "PERSISTENCE",
          "Sales report line data is inconsistent.",
        );
      const returnedLineMinor = roundedProduct(
        row.line_total_minor,
        row.returned_quantity_scaled,
        row.quantity_scaled,
      );
      returnedMinor += returnedLineMinor;
      returnedByInvoice.set(
        row.invoice_id,
        (returnedByInvoice.get(row.invoice_id) ?? 0) + returnedLineMinor,
      );
      const returnedSubtotal = roundedProduct(
        row.line_subtotal_minor,
        row.returned_quantity_scaled,
        row.quantity_scaled,
      );
      netSubtotalMinor += row.line_subtotal_minor - returnedSubtotal;
      const retainedQuantity =
        row.quantity_scaled - row.restocked_quantity_scaled;
      const retainedUnknownQuantity =
        row.unknown_quantity_scaled - row.restocked_unknown_quantity_scaled;
      if (
        row.restocked_unknown_quantity_scaled > row.unknown_quantity_scaled ||
        row.cost_layer_quantity_scaled > row.quantity_scaled
      )
        throw new AppError(
          "PERSISTENCE",
          "Sales report cost layers are inconsistent.",
        );
      if (retainedQuantity > 0 && retainedUnknownQuantity > 0)
        unknownCostLineCount++;
      if (row.cost_minor !== null) {
        costOfGoodsMinor += Math.max(
          0,
          row.cost_minor - row.restocked_cost_minor,
        );
      }
      const quantityScaled = row.quantity_scaled - row.returned_quantity_scaled;
      const netMinor = row.line_total_minor - returnedLineMinor;
      const product = productsById.get(row.product_id) ?? {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        categoryName: row.category_name,
        quantityScaled: 0,
        netSalesMinor: 0,
      };
      product.quantityScaled += quantityScaled;
      product.netSalesMinor += netMinor;
      productsById.set(row.product_id, product);
    }
    const products = [...productsById.values()]
      .filter((p) => p.quantityScaled > 0 || p.netSalesMinor > 0)
      .sort((a, b) => a.productName.localeCompare(b.productName));
    const categoriesByName = new Map<
      string,
      SalesReport["categories"][number]
    >();
    for (const product of products) {
      const category = categoriesByName.get(product.categoryName) ?? {
        categoryName: product.categoryName,
        quantityScaled: 0,
        netSalesMinor: 0,
      };
      category.quantityScaled += product.quantityScaled;
      category.netSalesMinor += product.netSalesMinor;
      categoriesByName.set(product.categoryName, category);
    }
    const grossSalesMinor = summary.gross_sales_minor;
    const netSalesMinor = grossSalesMinor - returnedMinor;
    const netPaymentsMinor = summary.net_payments_minor;
    if (
      ![
        summary.invoice_count,
        grossSalesMinor,
        netPaymentsMinor,
        returnedMinor,
        netSubtotalMinor,
        costOfGoodsMinor,
      ].every(Number.isSafeInteger) ||
      netSalesMinor < 0
    )
      throw new AppError(
        "PERSISTENCE",
        "Sales report totals exceed the supported range.",
      );
    const timezone = (await this.getBusiness(actorId)).timezone;
    const groups = new Map<string, SalesReport["groups"][number]>();
    for (const row of postedRows) {
      const period = groupPeriod(row.posted_at, groupBy, timezone);
      const group = groups.get(period) ?? {
        period,
        invoiceCount: 0,
        cancelledInvoiceCount: 0,
        netSalesMinor: 0,
        netPaymentsMinor: 0,
        outstandingMinor: 0,
      };
      group.invoiceCount++;
      group.netSalesMinor +=
        row.total_minor - (returnedByInvoice.get(row.id) ?? 0);
      group.netPaymentsMinor += row.net_payments_minor;
      groups.set(period, group);
    }
    for (const row of cancelledRows) {
      const period = groupPeriod(row.cancelled_at, groupBy, timezone);
      const group = groups.get(period) ?? {
        period,
        invoiceCount: 0,
        cancelledInvoiceCount: 0,
        netSalesMinor: 0,
        netPaymentsMinor: 0,
        outstandingMinor: 0,
      };
      group.cancelledInvoiceCount++;
      groups.set(period, group);
    }
    for (const group of groups.values())
      group.outstandingMinor = Math.max(
        0,
        group.netSalesMinor - group.netPaymentsMinor,
      );
    return {
      from: input.from,
      to: input.to,
      groupBy,
      groups: [...groups.values()].sort((a, b) =>
        a.period.localeCompare(b.period),
      ),
      invoiceCount: summary.invoice_count,
      cancelledInvoiceCount: cancelledRows.length,
      grossSalesMinor,
      returnedMinor,
      netSalesMinor,
      netSubtotalMinor,
      costOfGoodsMinor,
      grossProfitMinor: unknownCostLineCount
        ? null
        : netSubtotalMinor - costOfGoodsMinor,
      unknownCostLineCount,
      netPaymentsMinor,
      outstandingMinor: Math.max(0, netSalesMinor - netPaymentsMinor),
      products,
      categories: [...categoriesByName.values()].sort((a, b) =>
        a.categoryName.localeCompare(b.categoryName),
      ),
    };
  }

  exportSalesReportCsv(report: SalesReport): string {
    return Papa.unparse(
      safeCsvRows(
        report.products.map((row) => ({
          product: row.productName,
          sku: row.sku,
          category: row.categoryName,
          quantityScaled: row.quantityScaled,
          netSalesMinor: row.netSalesMinor,
        })),
      ),
      {
        columns: [
          "product",
          "sku",
          "category",
          "quantityScaled",
          "netSalesMinor",
        ],
      },
    );
  }

  async listInvoices(actorId: string, search = ""): Promise<InvoiceRecord[]> {
    const actor = await this.authorize(actorId, "billing.read");
    const rows = await this.database.query<InvoiceRow>(
      `${this.invoiceSelect()}
       WHERE i.business_id = $1 AND i.status <> 'DRAFT'
         AND ($2 = '' OR i.invoice_number LIKE $3 OR lower(coalesce(c.name, '')) LIKE $3)
       ORDER BY i.created_at DESC LIMIT 100`,
      [actor.businessId, search.trim(), `%${normalized(search)}%`],
    );
    return Promise.all(rows.map((row) => this.readInvoice(actor, row)));
  }

  async getInvoice(actorId: string, invoiceId: string): Promise<InvoiceRecord> {
    const actor = await this.authorize(actorId, "billing.read");
    const rows = await this.database.query<InvoiceRow>(
      `${this.invoiceSelect()} WHERE i.id = $1 AND i.business_id = $2`,
      [invoiceId, actor.businessId],
    );
    if (!rows[0]) throw new AppError("NOT_FOUND", "Invoice not found.");
    return this.readInvoice(actor, rows[0]);
  }

  async cancelInvoice(
    actorId: string,
    invoiceId: string,
    reason: string,
  ): Promise<InvoiceRecord> {
    const actor = await this.authorize(actorId, "billing.cancel");
    const normalizedReason = reason.trim();
    if (normalizedReason.length === 0 || normalizedReason.length > 240)
      throw new AppError("VALIDATION", "Enter a cancellation reason.");
    let result: { changes: number; lastInsertId?: number };
    try {
      result = await this.database.execute(
        `UPDATE invoices SET status = 'CANCELLED', cancelled_at = $1,
          cancellation_reason = $2
         WHERE id = $3 AND business_id = $4 AND status = 'POSTED'`,
        [this.runtime.now(), normalizedReason, invoiceId, actor.businessId],
      );
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
    if (result.changes === 0) {
      const invoice = await this.getInvoice(actorId, invoiceId);
      if (invoice.status === "CANCELLED") return invoice;
      throw new AppError("CONFLICT", "Only a posted invoice can be cancelled.");
    }
    return this.getInvoice(actorId, invoiceId);
  }

  async returnInvoice(
    actorId: string,
    invoiceId: string,
    value: InvoiceReturnInput,
  ): Promise<InvoiceRecord> {
    const actor = await this.authorize(actorId, "billing.create");
    const input = validationResult(invoiceReturnSchema, value);
    const invoice = await this.getInvoice(actorId, invoiceId);
    if (invoice.status !== "POSTED")
      throw new AppError("CONFLICT", "Only a posted invoice can be returned.");
    const returnLines = await Promise.all(
      input.lines.map(async (line) => {
        const source = invoice.lines.find(
          (candidate) => candidate.id === line.invoiceLineId,
        );
        if (!source)
          throw new AppError(
            "NOT_FOUND",
            "Returned item is not on this invoice.",
          );
        const quantityScaled = parseQuantityToScaledInteger(
          line.quantity,
          source.unitPrecision,
        );
        if (quantityScaled <= 0)
          throw new AppError(
            "VALIDATION",
            "Return quantity must be greater than zero.",
          );
        const priorReturned = await this.database.query<{
          quantity_scaled: number;
        }>(
          `SELECT coalesce(sum(irl.quantity_scaled),0) AS quantity_scaled
         FROM invoice_return_lines irl JOIN invoice_returns ir ON ir.id=irl.return_id
         WHERE ir.invoice_id=$1 AND irl.invoice_line_id=$2`,
          [invoiceId, line.invoiceLineId],
        );
        const priorQty = priorReturned[0]?.quantity_scaled ?? 0;
        if (priorQty + quantityScaled > source.quantityScaled)
          throw new AppError(
            "CONFLICT",
            "Returned quantity exceeds the invoiced quantity.",
          );
        const delta = (amount: number) =>
          roundedProduct(
            amount,
            priorQty + quantityScaled,
            source.quantityScaled,
          ) - roundedProduct(amount, priorQty, source.quantityScaled);
        return {
          invoiceLineId: line.invoiceLineId,
          quantityScaled,
          disposition: line.disposition,
          gstTaxReversalMinor: delta(source.taxMinor),
          cgstReversalMinor: delta(source.cgstMinor),
          sgstReversalMinor: delta(source.sgstMinor),
          igstReversalMinor: delta(source.igstMinor),
          cessReversalMinor: delta(source.cessMinor),
          taxableReversalMinor: delta(source.taxableValueMinor),
        };
      }),
    );
    if (
      new Set(returnLines.map((line) => line.invoiceLineId)).size !==
      returnLines.length
    )
      throw new AppError(
        "VALIDATION",
        "A returned invoice line can only appear once per return.",
      );
    const refundMinor = parseMoneyToMinorUnits(
      input.refund,
      (await this.getBusiness(actorId)).currencyFractionDigits,
    );
    const linesJson = JSON.stringify(returnLines);
    const sameReturnLines = (storedJson: string) => {
      try {
        const stored = JSON.parse(storedJson) as Array<{
          invoiceLineId: string;
          quantityScaled: number;
          disposition: string;
        }>;
        return (
          stored.length === returnLines.length &&
          returnLines.every(
            (line, index) =>
              stored[index]?.invoiceLineId === line.invoiceLineId &&
              stored[index]?.quantityScaled === line.quantityScaled &&
              stored[index]?.disposition === line.disposition,
          )
        );
      } catch {
        return false;
      }
    };
    const prior = await this.database.query<{
      invoice_id: string;
      reason: string;
      refund_minor: number;
      lines_json: string;
    }>(
      "SELECT invoice_id, reason, refund_minor, lines_json FROM invoice_returns WHERE business_id = $1 AND idempotency_key = $2",
      [actor.businessId, input.idempotencyKey],
    );
    if (prior[0]) {
      if (
        prior[0].invoice_id !== invoiceId ||
        prior[0].reason !== input.reason ||
        prior[0].refund_minor !== refundMinor ||
        !sameReturnLines(prior[0].lines_json)
      )
        throw new AppError(
          "CONFLICT",
          "This return request key was already used with different details.",
        );
      return this.getInvoice(actorId, invoiceId);
    }
    if (refundMinor > invoice.paidMinor)
      throw new AppError("VALIDATION", "Refund cannot exceed the amount paid.");
    const returnValueMinor = returnLines.reduce((sum, line) => {
      const source = invoice.lines.find(
        (candidate) => candidate.id === line.invoiceLineId,
      );
      if (!source)
        throw new AppError(
          "NOT_FOUND",
          "Returned item is not on this invoice.",
        );
      return (
        sum +
        roundedProduct(
          source.totalMinor,
          line.quantityScaled,
          source.quantityScaled,
        )
      );
    }, 0);
    if (refundMinor > returnValueMinor)
      throw new AppError(
        "VALIDATION",
        "Refund cannot exceed the value of the returned items.",
      );
    const id = this.runtime.createId();
    try {
      await this.database.execute(
        `INSERT INTO invoice_returns (
          id, business_id, invoice_id, actor_user_id, idempotency_key,
          reason, refund_minor, lines_json, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          actor.businessId,
          invoiceId,
          actor.id,
          input.idempotencyKey,
          input.reason,
          refundMinor,
          linesJson,
          this.runtime.now(),
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) {
        const duplicate = await this.database.query<{
          invoice_id: string;
          reason: string;
          refund_minor: number;
          lines_json: string;
        }>(
          "SELECT invoice_id, reason, refund_minor, lines_json FROM invoice_returns WHERE business_id = $1 AND idempotency_key = $2",
          [actor.businessId, input.idempotencyKey],
        );
        if (duplicate[0]) {
          if (
            duplicate[0].invoice_id !== invoiceId ||
            duplicate[0].reason !== input.reason ||
            duplicate[0].refund_minor !== refundMinor ||
            !sameReturnLines(duplicate[0].lines_json)
          )
            throw new AppError(
              "CONFLICT",
              "This return request key was already used with different details.",
            );
          return this.getInvoice(actorId, invoiceId);
        }
        throw persistenceConflict(error);
      }
      throw error;
    }
    return this.getInvoice(actorId, invoiceId);
  }

  private invoiceSelect(): string {
    return `SELECT i.id, i.invoice_number, i.customer_id,
      coalesce(nullif(i.customer_name_snapshot,''),c.name, 'Walk-in') AS customer_name, i.status,
      i.subtotal_minor, i.discount_minor, i.tax_minor, i.total_minor,
      coalesce((SELECT sum(p.amount_minor) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid_minor,
      i.created_at, i.posted_at, i.cancelled_at, i.cancellation_reason,
      i.gst_document_type,i.customer_gstin_snapshot,i.customer_address_snapshot,
      i.customer_state_code_snapshot,i.supplier_gstin_snapshot,i.supplier_legal_name_snapshot,
      i.supplier_trade_name_snapshot,i.supplier_address_snapshot,i.supplier_state_code_snapshot,
      i.place_of_supply_state_code,i.reverse_charge,i.financial_year_snapshot
      FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id`;
  }

  private async readInvoice(
    actor: Actor,
    row: InvoiceRow,
  ): Promise<InvoiceRecord> {
    const lines = await this.database.query<{
      id: string;
      product_id: string;
      product_name_snapshot: string;
      sku_snapshot: string;
      barcode_snapshot: string | null;
      unit_name_snapshot: string;
      unit_precision: number;
      quantity_scaled: number;
      unit_price_minor: number;
      discount_minor: number;
      tax_rate_basis_points: number;
      hsn_sac_snapshot: string;
      gst_supply_type_snapshot: ProductRecord["gstSupplyType"];
      gst_pricing_mode_snapshot: ProductRecord["gstPricingMode"];
      gst_taxable_value_minor: number;
      cgst_minor: number;
      sgst_minor: number;
      igst_minor: number;
      cess_rate_basis_points: number;
      cess_minor: number;
      line_subtotal_minor: number;
      tax_minor: number;
      line_total_minor: number;
    }>(
      `SELECT id, product_id, product_name_snapshot, sku_snapshot, barcode_snapshot,
        unit_name_snapshot, unit_precision, quantity_scaled, unit_price_minor,
        discount_minor, tax_rate_basis_points, line_subtotal_minor, tax_minor, line_total_minor
        ,hsn_sac_snapshot,gst_supply_type_snapshot,gst_pricing_mode_snapshot,gst_taxable_value_minor,
        cgst_minor,sgst_minor,igst_minor,cess_rate_basis_points,cess_minor
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY rowid`,
      [row.id],
    );
    const payments = await this.database.query<{
      id: string;
      payment_type: PaymentRecord["method"];
      amount_minor: number;
      reference: string;
      reason: string;
      occurred_at: string;
    }>(
      `SELECT id, payment_type, amount_minor, reference, reason, occurred_at
       FROM payments WHERE invoice_id = $1 ORDER BY occurred_at, id`,
      [row.id],
    );
    void actor;
    return mapInvoice(
      row,
      lines.map((line) => ({
        id: line.id,
        productId: line.product_id,
        productName: line.product_name_snapshot,
        sku: line.sku_snapshot,
        barcode: line.barcode_snapshot,
        unitName: line.unit_name_snapshot,
        unitPrecision: line.unit_precision,
        quantityScaled: line.quantity_scaled,
        unitPriceMinor: line.unit_price_minor,
        discountMinor: line.discount_minor,
        taxRateBasisPoints: line.tax_rate_basis_points,
        hsnSacCode: line.hsn_sac_snapshot,
        gstSupplyType: line.gst_supply_type_snapshot,
        gstPricingMode: line.gst_pricing_mode_snapshot,
        taxableValueMinor: line.gst_taxable_value_minor,
        cgstMinor: line.cgst_minor,
        sgstMinor: line.sgst_minor,
        igstMinor: line.igst_minor,
        cessRateBasisPoints: line.cess_rate_basis_points,
        cessMinor: line.cess_minor,
        subtotalMinor: line.line_subtotal_minor,
        taxMinor: line.tax_minor,
        totalMinor: line.line_total_minor,
      })),
      payments.map((payment) => ({
        id: payment.id,
        method: payment.payment_type,
        amountMinor: payment.amount_minor,
        reference: payment.reference,
        reason: payment.reason,
        occurredAt: payment.occurred_at,
      })),
    );
  }

  private async currentStock(
    businessId: string,
    productId: string,
  ): Promise<number> {
    const rows = await this.database.query<{ balance: number | null }>(
      `SELECT sum(quantity_delta_scaled) AS balance FROM stock_movements
       WHERE business_id = $1 AND product_id = $2`,
      [businessId, productId],
    );
    const balance = rows[0]?.balance ?? 0;
    if (!Number.isSafeInteger(balance))
      throw new AppError(
        "PERSISTENCE",
        "A stored stock balance exceeds the supported range.",
      );
    return balance;
  }

  private async authorize(
    actorId: string,
    permission: Permission,
  ): Promise<Actor> {
    if (
      !this.activeSession ||
      this.activeSession.userId !== actorId ||
      this.activeSession.expiresAt <= Date.now()
    ) {
      this.logout();
      throw new AppError(
        "UNAUTHENTICATED",
        "Your session expired. Sign in again.",
      );
    }
    const rows = await this.database.query<{
      id: string;
      business_id: string;
      role: string;
      disabled_at: string | null;
      setup_complete: number;
    }>(
      `SELECT u.id, u.business_id, u.role, u.disabled_at, b.setup_complete
       FROM users u JOIN businesses b ON b.id = u.business_id
       WHERE u.id = $1`,
      [actorId],
    );
    const row = rows[0];
    if (
      !row ||
      row.disabled_at ||
      !validRole(row.role) ||
      row.setup_complete !== 1
    ) {
      this.logout();
      throw new AppError(
        "UNAUTHENTICATED",
        "Your account is unavailable. Sign in again.",
      );
    }
    assertPermission(row.role, permission);
    return { id: row.id, businessId: row.business_id, role: row.role };
  }

  private startSession(userId: string): void {
    this.activeSession = {
      userId,
      expiresAt: Date.now() + this.sessionTtlMinutes * 60_000,
    };
  }

  private async readProduct(
    businessId: string,
    productId: string,
  ): Promise<ProductRecord | undefined> {
    const rows = await this.database.query<ProductRow>(
      `SELECT p.id, p.business_id, p.name, p.sku, p.description, p.tax_category,
          p.hsn_sac_code,p.gst_supply_type,p.gst_pricing_mode,p.category_id,
          p.category_name_snapshot, p.unit_id, p.unit_name_snapshot, p.unit_precision_snapshot,
          p.purchase_price_minor, p.selling_price_minor, p.reorder_threshold_scaled, p.is_active,
          p.archived_at, p.version,
          (SELECT b.value FROM barcode_mappings b WHERE b.product_id = p.id AND b.retired_at IS NULL
            ORDER BY b.created_at DESC LIMIT 1) AS active_barcode,
          (SELECT b.symbology FROM barcode_mappings b WHERE b.product_id = p.id AND b.retired_at IS NULL
            ORDER BY b.created_at DESC LIMIT 1) AS active_barcode_symbology
       FROM products p WHERE p.id = $1 AND p.business_id = $2`,
      [productId, businessId],
    );
    return rows[0] ? mapProduct(rows[0]) : undefined;
  }

  private async insertBarcode(
    actor: Actor,
    productId: string,
    value: string,
    symbology: BarcodeSymbology,
    replacesBarcodeId: string | null,
    reason: string,
  ): Promise<void> {
    try {
      await this.database.execute(
        `INSERT INTO barcode_mappings (
          id, business_id, product_id, value, symbology, created_by, created_at,
          replaces_barcode_id, change_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          this.runtime.createId(),
          actor.businessId,
          productId,
          value,
          symbology,
          actor.id,
          this.runtime.now(),
          replacesBarcodeId,
          reason,
        ],
      );
    } catch (error) {
      if (isConstraintError(error)) throw persistenceConflict(error);
      throw error;
    }
  }
}
