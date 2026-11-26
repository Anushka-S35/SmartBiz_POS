export type UserRole = "ADMIN" | "MANAGER" | "CASHIER";
export type Locale = "en" | "hi" | "mr";
export type BarcodeSymbology = "CODE128" | "EAN13";
export type GstRegistrationType =
  "NOT_CONFIGURED" | "REGULAR" | "COMPOSITION" | "UNREGISTERED";
export type GstDocumentType =
  | "TAX_INVOICE"
  | "BILL_OF_SUPPLY"
  | "INVOICE_CUM_BILL_OF_SUPPLY"
  | "RETAIL_RECEIPT";

export interface Actor {
  id: string;
  businessId: string;
  role: UserRole;
}

export interface BusinessProfile {
  id: string;
  legalName: string;
  displayName: string;
  address: string;
  phone: string;
  email: string;
  logoUri: string | null;
  currencyCode: string;
  currencyFractionDigits: number;
  timezone: string;
  invoicePrefix: string;
  taxEnabled: boolean;
  taxRegistrationId: string | null;
  gstRegistrationType: GstRegistrationType;
  gstTradeName: string;
  gstStateCode: string;
  gstRegisteredAddress: string;
  gstFinancialYearStartMonth: number;
  gstInvoicePrefix: string;
  gstInvoiceFooter: string;
  allowMultipleBarcodes: boolean;
  setupComplete: boolean;
}

export interface UserRecord {
  id: string;
  businessId: string;
  email: string;
  displayName: string;
  role: UserRole;
  disabledAt: string | null;
}

export interface CategoryRecord {
  id: string;
  businessId: string;
  name: string;
  archivedAt: string | null;
}

export interface UnitRecord {
  id: string;
  businessId: string;
  name: string;
  code: string;
  quantityPrecision: number;
  archivedAt: string | null;
}

export interface ProductRecord {
  id: string;
  businessId: string;
  name: string;
  sku: string;
  description: string;
  taxCategory: string;
  hsnSacCode: string;
  gstSupplyType: "TAXABLE" | "EXEMPT" | "NIL_RATED" | "NON_GST";
  gstPricingMode: "INCLUSIVE" | "EXCLUSIVE";
  categoryId: string | null;
  categoryName: string;
  unitId: string;
  unitName: string;
  unitPrecision: number;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  reorderThresholdScaled: number;
  isActive: boolean;
  archivedAt: string | null;
  version: number;
  activeBarcode: string | null;
  activeBarcodeSymbology: BarcodeSymbology | null;
}

export interface TaxRateRecord {
  id: string;
  categoryCode: string;
  rateBasisPoints: number;
  cessRateBasisPoints: number;
  effectiveAt: string;
  sourceReference: string;
  reason: string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  stateCode: string;
  archivedAt: string | null;
}

export interface SupplierRecord {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  archivedAt: string | null;
}

export type ItcClassification = "UNASSESSED" | "ELIGIBLE" | "INELIGIBLE" | "BLOCKED";
export type ItcAdjustmentType = "CLAIM" | "REVERSAL" | "RECLAIM";

export interface PurchaseLineInput {
  productId: string;
  quantity: string;
  unitCost: string;
  hsnSacCode?: string;
  gstSupplyType?: "TAXABLE" | "EXEMPT" | "NIL_RATED" | "NON_GST";
  gstPricingMode?: "INCLUSIVE" | "EXCLUSIVE";
  gstRateBasisPoints?: number;
  cessRateBasisPoints?: number;
  discountMinor?: number;
}

export interface PurchaseInput {
  supplierId: string;
  referenceNumber: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  idempotencyKey: string;
  reverseCharge?: boolean;
  lines: PurchaseLineInput[];
}

export interface PurchaseLineGstSnapshot {
  hsnSacCode: string;
  gstSupplyType: "TAXABLE" | "EXEMPT" | "NIL_RATED" | "NON_GST";
  gstPricingMode: "INCLUSIVE" | "EXCLUSIVE";
  gstRateBasisPoints: number;
  cessRateBasisPoints: number;
  taxableValueMinor: number;
  inputCgstMinor: number;
  inputSgstMinor: number;
  inputIgstMinor: number;
  inputCessMinor: number;
  inputTaxMinor: number;
  itcStatus: ItcClassification;
}

export interface PurchaseRecord {
  id: string;
  supplierId: string;
  supplierName: string;
  referenceNumber: string;
  supplierInvoiceNumber: string;
  supplierInvoiceDate: string;
  supplierGstinSnapshot: string;
  status: "RECEIVED";
  totalMinor: number;
  inputTaxTotalMinor: number;
  reverseCharge: boolean;
  createdAt: string;
  lines: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    quantityScaled: number;
    unitCostMinor: number;
    lineTotalMinor: number;
    gst: PurchaseLineGstSnapshot;
  }>;
}

export interface PurchaseItcAdjustmentRecord {
  id: string;
  purchaseId: string;
  purchaseLineId: string;
  adjustmentType: ItcAdjustmentType;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  reason: string;
  occurredAt: string;
  actorName: string;
}

export type GstRegisterScope = "SALES" | "PURCHASES";

export interface GstRegisterLine {
  documentNumber: string;
  documentDate: string;
  partyGstin: string;
  partyName: string;
  hsnSacCode: string;
  taxableValueMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  totalTaxMinor: number;
  totalMinor: number;
  documentType: string;
  status: string;
  reference: string;
}

export interface GstRegister {
  scope: GstRegisterScope;
  from: string;
  to: string;
  lines: GstRegisterLine[];
  totals: {
    taxableValueMinor: number;
    cgstMinor: number;
    sgstMinor: number;
    igstMinor: number;
    cessMinor: number;
    totalTaxMinor: number;
    totalMinor: number;
  };
}

export interface GstTaxSummary {
  taxHead: "CGST" | "SGST" | "IGST" | "CESS";
  taxableValueMinor: number;
  taxMinor: number;
}

export interface GstItcSummary {
  classification: ItcClassification;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  totalMinor: number;
  lineCount: number;
}

export interface GstNetLiabilitySummary {
  outputCgstMinor: number;
  outputSgstMinor: number;
  outputIgstMinor: number;
  outputCessMinor: number;
  outputTotalMinor: number;
  inputCgstMinor: number;
  inputSgstMinor: number;
  inputIgstMinor: number;
  inputCessMinor: number;
  inputTotalMinor: number;
  eligibleInputCgstMinor: number;
  eligibleInputSgstMinor: number;
  eligibleInputIgstMinor: number;
  eligibleInputCessMinor: number;
  eligibleInputTotalMinor: number;
  netCgstMinor: number;
  netSgstMinor: number;
  netIgstMinor: number;
  netCessMinor: number;
  netPayableMinor: number;
}

export type ReportGrouping = "day" | "week" | "month";
export interface SalesReportGroup {
  period: string;
  invoiceCount: number;
  cancelledInvoiceCount: number;
  netSalesMinor: number;
  netPaymentsMinor: number;
  outstandingMinor: number;
}
export interface PurchaseReportGroup {
  period: string;
  purchaseCount: number;
  purchasesMinor: number;
  creditsMinor: number;
  netPurchasesMinor: number;
  paymentsMinor: number;
}

export interface SalesReport {
  groupBy: ReportGrouping;
  groups: SalesReportGroup[];
  from: string;
  to: string;
  invoiceCount: number;
  cancelledInvoiceCount: number;
  grossSalesMinor: number;
  returnedMinor: number;
  netSalesMinor: number;
  netSubtotalMinor: number;
  costOfGoodsMinor: number;
  grossProfitMinor: number | null;
  unknownCostLineCount: number;
  netPaymentsMinor: number;
  outstandingMinor: number;
  products: Array<{
    productId: string;
    productName: string;
    sku: string;
    categoryName: string;
    quantityScaled: number;
    netSalesMinor: number;
  }>;
  categories: Array<{
    categoryName: string;
    quantityScaled: number;
    netSalesMinor: number;
  }>;
}

export interface SupplierCreditInput {
  supplierId: string;
  purchaseId: string;
  reason: string;
  idempotencyKey: string;
  lines: Array<{ purchaseLineId: string; quantity: string }>;
}
export interface SupplierCreditRecord {
  id: string;
  supplierId: string;
  purchaseId: string;
  reason: string;
  creditMinor: number;
  createdAt: string;
}
export interface SupplierPaymentInput {
  supplierId: string;
  amount: string;
  method: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
  reference: string;
  idempotencyKey: string;
}
export interface SupplierPaymentRecord {
  id: string;
  supplierId: string;
  amountMinor: number;
  method: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER";
  reference: string;
  occurredAt: string;
}
export interface SupplierBalanceRecord {
  supplierId: string;
  supplierName: string;
  purchasesMinor: number;
  creditsMinor: number;
  paymentsMinor: number;
  outstandingMinor: number;
}
export interface PurchaseReport {
  from: string;
  to: string;
  groupBy: ReportGrouping;
  groups: PurchaseReportGroup[];
  purchaseCount: number;
  purchasesMinor: number;
  creditsMinor: number;
  netPurchasesMinor: number;
  paymentsMinor: number;
  suppliers: SupplierBalanceRecord[];
}
export interface InventoryValuation {
  method: "FIFO";
  knownValueMinor: number;
  unknownQuantityScaled: number;
  products: Array<{
    productId: string;
    productName: string;
    unitName: string;
    unitPrecision: number;
    onHandScaled: number;
    knownValueMinor: number;
    unknownQuantityScaled: number;
  }>;
}

export interface CustomerSalesSummary {
  invoiceCount: number;
  netSalesMinor: number;
  netPaidMinor: number;
  outstandingMinor: number;
}

export interface StockBalanceRecord {
  productId: string;
  productName: string;
  sku: string;
  unitName: string;
  unitPrecision: number;
  onHandScaled: number;
  reorderThresholdScaled: number;
  lowStock: boolean;
}

export type StockMovementType =
  | "OPENING"
  | "PURCHASE_IN"
  | "MANUAL_IN"
  | "MANUAL_OUT"
  | "ADJUSTMENT"
  | "SALE"
  | "SALE_RETURN"
  | "PURCHASE_RETURN"
  | "CANCELLATION";

export interface StockMovementRecord {
  id: string;
  productId: string;
  productName: string;
  movementType: StockMovementType;
  quantityDeltaScaled: number;
  sourceType: string;
  sourceId: string | null;
  reason: string;
  occurredAt: string;
  actorName: string;
  balanceAfterScaled: number;
}

export type PaymentMethod =
  "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "CREDIT" | "REFUND";

export interface InvoiceLineRecord {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  unitName: string;
  unitPrecision: number;
  quantityScaled: number;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBasisPoints: number;
  hsnSacCode: string;
  gstSupplyType: ProductRecord["gstSupplyType"];
  gstPricingMode: ProductRecord["gstPricingMode"];
  taxableValueMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessRateBasisPoints: number;
  cessMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface PaymentRecord {
  id: string;
  method: PaymentMethod;
  amountMinor: number;
  reference: string;
  reason: string;
  occurredAt: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string;
  customerGstinSnapshot: string;
  customerAddressSnapshot: string;
  customerStateCodeSnapshot: string;
  documentType: GstDocumentType;
  supplierGstinSnapshot: string;
  supplierLegalNameSnapshot: string;
  supplierTradeNameSnapshot: string;
  supplierAddressSnapshot: string;
  supplierStateCodeSnapshot: string;
  placeOfSupplyStateCode: string;
  reverseCharge: boolean;
  financialYear: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  createdAt: string;
  postedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string;
  lines: InvoiceLineRecord[];
  payments: PaymentRecord[];
}

export interface BarcodeHistoryRecord {
  id: string;
  eventType: "ASSIGNED" | "REMAPPED";
  previousValue: string | null;
  newValue: string;
  symbology: BarcodeSymbology;
  actorUserId: string;
  reason: string;
  occurredAt: string;
}

export interface Runtime {
  now(): string;
  createId(): string;
  randomBytes(length: number): Uint8Array;
}

export interface SqlDatabase {
  execute(
    sql: string,
    params?: readonly (string | number | null)[],
  ): Promise<{ changes: number; lastInsertId?: number }>;
  query<T>(
    sql: string,
    params?: readonly (string | number | null)[],
  ): Promise<T[]>;
  executeScript(sql: string): Promise<void>;
  currentMigrationVersion(): Promise<number>;
}
