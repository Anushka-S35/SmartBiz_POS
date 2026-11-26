import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AppError,
  SmartBizApplication,
  type BusinessProfileInput,
} from "./index";
import type { Runtime } from "./models";
import { migrateDatabase } from "./migrate";
import { migrations } from "./migrations";
import { TestSqliteDatabase } from "./testing/sqlite";

const businessProfile: BusinessProfileInput = {
  legalName: "SmartBiz Retail Private Limited",
  displayName: "SmartBiz Retail",
  address: "Pune",
  phone: "+91 9876543210",
  email: "hello@smartbiz.example",
  logoUri: "",
  currencyCode: "INR",
  timezone: "Asia/Kolkata",
  invoicePrefix: "SB",
  taxEnabled: false,
  taxRegistrationId: "",
  gstRegistrationType: "NOT_CONFIGURED",
  gstTradeName: "",
  gstStateCode: "",
  gstRegisteredAddress: "",
  gstFinancialYearStartMonth: 4,
  gstInvoicePrefix: "GST",
  gstInvoiceFooter: "",
  allowMultipleBarcodes: false,
};

const ownerCredentials = {
  email: "owner@smartbiz.example",
  displayName: "Shop Owner",
  password: "A-strong-example-password-89",
};

let database: TestSqliteDatabase;
let application: SmartBizApplication;
let ownerId: string;
let idCounter: number;

function runtime(): Runtime {
  return {
    now: () => "2026-11-04T10:00:00.000Z",
    createId: () =>
      `00000000-0000-4000-8000-${String(++idCounter).padStart(12, "0")}`,
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
  };
}

async function createProduct(name = "Tea", taxCategory = ""): Promise<string> {
  const piece = (await application.listUnits(ownerId)).find(
    (unit) => unit.code === "piece",
  );
  if (!piece) throw new Error("Seed unit was not created.");
  const product = await application.saveProduct(ownerId, {
    name,
    sku: `SKU-${name.toUpperCase().replaceAll(" ", "-")}`,
    description: "",
    taxCategory,
    categoryId: null,
    unitId: piece.id,
    purchasePrice: "12.35",
    sellingPrice: "19.99",
    reorderThreshold: "3",
    hsnSacCode: "0902",
  });
  return product.id;
}

async function stock(
  productId: string,
  movementType: "OPENING" | "MANUAL_IN" | "MANUAL_OUT" | "ADJUSTMENT",
  quantity: string,
  idempotencyKey: string,
): Promise<void> {
  await application.recordStockMovement(ownerId, {
    productId,
    movementType,
    quantity,
    reason: "Test stock operation",
    idempotencyKey,
  });
}

beforeEach(async () => {
  database = new TestSqliteDatabase();
  await migrateDatabase(database);
  idCounter = 0;
  application = new SmartBizApplication(database, runtime(), 30);
  const owner = await application.setupBusiness(
    businessProfile,
    ownerCredentials,
  );
  ownerId = owner.id;
});

afterEach(() => {
  database.close();
});

describe("inventory ledger", () => {
  it("derives balances from append-only movements, flags low stock, and rejects negative stock", async () => {
    const productId = await createProduct();
    await Promise.all([
      stock(productId, "OPENING", "10", "stock-opening-01"),
      stock(productId, "OPENING", "10", "stock-opening-01"),
    ]);
    await stock(productId, "MANUAL_OUT", "6", "stock-out-0001");
    await stock(productId, "ADJUSTMENT", "-2", "stock-adjust-01");

    await expect(
      stock(productId, "MANUAL_OUT", "3", "stock-out-0002"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      stock(productId, "MANUAL_IN", "1", "stock-opening-01"),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const balances = await application.listStockBalances(ownerId, {
      lowStockOnly: true,
    });
    expect(balances).toMatchObject([
      { productId, onHandScaled: 2, lowStock: true },
    ]);
    expect(
      await application.listStockMovements(ownerId, productId),
    ).toHaveLength(3);
    await expect(
      database.execute("DELETE FROM stock_movements WHERE product_id = $1", [
        productId,
      ]),
    ).rejects.toThrow(/append_only/i);
  });
});

describe("suppliers and purchasing", () => {
  it("receives multiple products atomically, preserves cost snapshots, and is idempotent", async () => {
    const tea = await createProduct("Tea");
    const soap = await createProduct("Soap");
    const supplier = await application.saveSupplier(ownerId, {
      name: "Pune Wholesale",
      contactName: "Ravi",
      phone: "+91 9876543210",
      email: "ravi@supplier.example",
      address: "Pune",
    });
    const input = {
      supplierId: supplier.id,
      referenceNumber: "GRN-1001",
      idempotencyKey: "purchase-receipt-1001",
      lines: [
        { productId: tea, quantity: "10", unitCost: "8.50" },
        { productId: soap, quantity: "4", unitCost: "21.25" },
      ],
    };
    const [first, retry] = await Promise.all([
      application.receivePurchase(ownerId, input),
      application.receivePurchase(ownerId, input),
    ]);
    expect(retry.id).toBe(first.id);
    expect(first.totalMinor).toBe(17000);
    expect(first.lines).toHaveLength(2);
    expect(await application.listPurchases(ownerId, supplier.id)).toHaveLength(
      1,
    );
    expect(
      (await application.listStockBalances(ownerId)).find(
        (row) => row.productId === tea,
      )?.onHandScaled,
    ).toBe(10);
    expect(
      (await application.listStockMovements(ownerId, tea))[0],
    ).toMatchObject({
      movementType: "PURCHASE_IN",
      sourceType: "PURCHASE",
      sourceId: first.id,
      quantityDeltaScaled: 10,
      balanceAfterScaled: 10,
    });
    await expect(
      application.receivePurchase(ownerId, {
        ...input,
        referenceNumber: "GRN-1002",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      database.execute("DELETE FROM purchases WHERE id = $1", [first.id]),
    ).rejects.toThrow(/append_only/i);
  });

  it("validates supplier contacts and rejects inactive products without receiving stock", async () => {
    await expect(
      application.saveSupplier(ownerId, {
        name: "",
        contactName: "",
        phone: "bad",
        email: "",
        address: "",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const supplier = await application.saveSupplier(ownerId, {
      name: "Wholesale",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    const product = await createProduct();
    await application.setProductArchived(ownerId, product, true);
    await expect(
      application.receivePurchase(ownerId, {
        supplierId: supplier.id,
        referenceNumber: "R-1",
        idempotencyKey: "purchase-invalid-1",
        lines: [{ productId: product, quantity: "1", unitCost: "1.00" }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await application.listStockBalances(ownerId)).toHaveLength(0);
  });
});

describe("customers", () => {
  it("validates, searches, edits, archives, and restores customer records", async () => {
    const customer = await application.saveCustomer(ownerId, {
      name: "Asha Patil",
      phone: "+91 9876543210",
      email: "asha@example.test",
      address: "Pune",
    });
    expect(await application.listCustomers(ownerId, "asha")).toMatchObject([
      { id: customer.id, name: "Asha Patil" },
    ]);
    await expect(
      application.saveCustomer(ownerId, {
        name: "",
        phone: "bad",
        email: "not-an-email",
        address: "",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const updated = await application.saveCustomer(
      ownerId,
      {
        name: "Asha P.",
        phone: "+91 9876543210",
        email: "asha@example.test",
        address: "Mumbai",
      },
      customer.id,
    );
    expect(updated.address).toBe("Mumbai");
    await application.setCustomerArchived(ownerId, customer.id, true);
    expect(await application.listCustomers(ownerId, "asha")).toHaveLength(0);
    await application.setCustomerArchived(ownerId, customer.id, false);
    expect(await application.listCustomers(ownerId, "asha")).toHaveLength(1);
  });
});

describe("supplier credits, settlements, and FIFO valuation", () => {
  it("neutralizes formula-like user fields in product, sales, and purchase CSV exports", async () => {
    const productId = await createProduct("=SUM(1,1)");
    const productCsv = await application.exportProductsCsv(ownerId);
    expect(productCsv).toContain("'=SUM(1,1)");
    const product = (await application.listProducts(ownerId)).find(
      (row) => row.id === productId,
    );
    if (!product) throw new Error("Formula product missing.");
    const importPreview = await application.previewProductsCsv(
      ownerId,
      productCsv.replace(product.sku, "SAFE-IMPORT-2"),
    );
    expect(importPreview[0]?.product?.name).toBe("=SUM(1,1)");
    await stock(productId, "OPENING", "2", "csv-formula-opening");
    const supplier = await application.saveSupplier(ownerId, {
      name: "@SUM(Supplier)",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "CSV-1",
      idempotencyKey: "csv-injection-purchase",
      lines: [{ productId, quantity: "1", unitCost: "1.00" }],
    });
    const purchaseReport = await application.getPurchaseReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
    });
    expect(application.exportPurchaseReportCsv(purchaseReport)).toContain(
      "'@SUM(Supplier)",
    );
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "csv-injection-sale",
      lines: [{ productId, quantity: "1", discount: "0" }],
    });
    await application.postInvoice(ownerId, invoice.id);
    const salesReport = await application.getSalesReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
    });
    expect(application.exportSalesReportCsv(salesReport)).toContain(
      "'=SUM(1,1)",
    );
  });

  it("links returns to receipts, reverses stock atomically, settles payable balances, and snapshots FIFO COGS", async () => {
    const productId = await createProduct();
    const supplier = await application.saveSupplier(ownerId, {
      name: "Costed Supplier",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    const purchase = await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "INV-COST-1",
      idempotencyKey: "purchase-cost-layer-1",
      lines: [{ productId, quantity: "5", unitCost: "4.00" }],
    });
    const purchaseLine = purchase.lines[0];
    if (!purchaseLine) throw new Error("Purchase line missing.");
    expect(await application.getInventoryValuation(ownerId)).toMatchObject({
      method: "FIFO",
      knownValueMinor: 2000,
      unknownQuantityScaled: 0,
    });
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "invoice-fifo-cost-1",
      lines: [{ productId, quantity: "2", discount: "0" }],
    });
    await application.postInvoice(ownerId, invoice.id);
    const invoiceLine = invoice.lines[0];
    if (!invoiceLine) throw new Error("Invoice line missing.");
    expect(
      await database.query(
        "SELECT cost_minor,unknown_quantity_scaled,method FROM invoice_line_costs WHERE invoice_line_id=$1",
        [invoiceLine.id],
      ),
    ).toMatchObject([
      { cost_minor: 800, unknown_quantity_scaled: 0, method: "FIFO" },
    ]);
    const report = await application.getSalesReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
    });
    expect(report).toMatchObject({
      netSubtotalMinor: 3998,
      costOfGoodsMinor: 800,
      grossProfitMinor: 3198,
      unknownCostLineCount: 0,
    });

    const credit = await application.createSupplierCredit(ownerId, {
      supplierId: supplier.id,
      purchaseId: purchase.id,
      reason: "Return one sealed item",
      idempotencyKey: "supplier-credit-cost-1",
      lines: [{ purchaseLineId: purchaseLine.id, quantity: "1" }],
    });
    expect(credit.creditMinor).toBe(400);
    expect(
      (await application.listStockBalances(ownerId)).find(
        (row) => row.productId === productId,
      )?.onHandScaled,
    ).toBe(2);
    await expect(
      application.createSupplierCredit(ownerId, {
        supplierId: supplier.id,
        purchaseId: purchase.id,
        reason: "Too many returned",
        idempotencyKey: "supplier-credit-stock-fail",
        lines: [{ purchaseLineId: purchaseLine.id, quantity: "3" }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await database.query(
        "SELECT count(*) AS count FROM supplier_credits",
        [],
      ),
    ).toMatchObject([{ count: 1 }]);

    const paid = await application.recordSupplierPayment(ownerId, {
      supplierId: supplier.id,
      amount: "5.00",
      method: "BANK_TRANSFER",
      reference: "UTR-1",
      idempotencyKey: "supplier-payment-cost-1",
    });
    expect(paid).toMatchObject({
      purchasesMinor: 2000,
      creditsMinor: 400,
      paymentsMinor: 500,
      outstandingMinor: 1100,
    });
    expect(
      await application.recordSupplierPayment(ownerId, {
        supplierId: supplier.id,
        amount: "5.00",
        method: "BANK_TRANSFER",
        reference: "UTR-1",
        idempotencyKey: "supplier-payment-cost-1",
      }),
    ).toMatchObject({ outstandingMinor: 1100 });
    await expect(
      application.recordSupplierPayment(ownerId, {
        supplierId: supplier.id,
        amount: "12.00",
        method: "CASH",
        reference: "",
        idempotencyKey: "supplier-payment-overpay",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const purchaseReport = await application.getPurchaseReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
      groupBy: "day",
    });
    expect(purchaseReport).toMatchObject({
      purchaseCount: 1,
      purchasesMinor: 2000,
      creditsMinor: 400,
      netPurchasesMinor: 1600,
      paymentsMinor: 500,
    });
    expect(purchaseReport.groups).toMatchObject([
      {
        period: "2026-11-04",
        purchaseCount: 1,
        purchasesMinor: 2000,
        creditsMinor: 400,
        netPurchasesMinor: 1600,
        paymentsMinor: 500,
      },
    ]);
    expect(application.exportPurchaseReportCsv(purchaseReport)).toContain(
      "Costed Supplier",
    );
    expect(await application.getInventoryValuation(ownerId)).toMatchObject({
      knownValueMinor: 800,
      unknownQuantityScaled: 0,
    });
    await expect(
      database.execute("DELETE FROM supplier_credits WHERE id=$1", [credit.id]),
    ).rejects.toThrow(/append_only/i);
  });

  it("keeps old or uncosted stock explicitly unknown under FIFO valuation", async () => {
    const productId = await createProduct("Unknown stock");
    await stock(productId, "OPENING", "2", "stock-unknown-fifo");
    const supplier = await application.saveSupplier(ownerId, {
      name: "Known cost supplier",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "FIFO-1",
      idempotencyKey: "purchase-known-after-unknown",
      lines: [{ productId, quantity: "3", unitCost: "2.00" }],
    });
    expect(await application.getInventoryValuation(ownerId)).toMatchObject({
      knownValueMinor: 600,
      unknownQuantityScaled: 2,
      products: [
        {
          productId,
          onHandScaled: 5,
          knownValueMinor: 600,
          unknownQuantityScaled: 2,
        },
      ],
    });
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "invoice-unknown-fifo",
      lines: [{ productId, quantity: "3", discount: "0" }],
    });
    await application.postInvoice(ownerId, invoice.id);
    const invoiceLine = invoice.lines[0];
    if (!invoiceLine) throw new Error("Invoice line missing.");
    expect(
      await database.query(
        "SELECT cost_minor,unknown_quantity_scaled FROM invoice_line_costs WHERE invoice_line_id=$1",
        [invoiceLine.id],
      ),
    ).toMatchObject([{ cost_minor: 200, unknown_quantity_scaled: 2 }]);
    const report = await application.getSalesReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
    });
    expect(report.grossProfitMinor).toBeNull();
    expect(report.unknownCostLineCount).toBe(1);
  });

  it("restores the right per-unit layer for a one-unit return and resale", async () => {
    const productId = await createProduct("One returned unit");
    const supplier = await application.saveSupplier(ownerId, {
      name: "One unit supplier",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "ONE-3",
      idempotencyKey: "one-unit-cost-receipt",
      lines: [{ productId, quantity: "3", unitCost: "4.00" }],
    });
    const sold = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "one-unit-multi-sale",
      lines: [{ productId, quantity: "3", discount: "0" }],
    });
    await application.postInvoice(ownerId, sold.id);
    const soldLine = sold.lines[0];
    if (!soldLine) throw new Error("Invoice line missing.");
    await application.returnInvoice(ownerId, sold.id, {
      reason: "Return one",
      refund: "0",
      idempotencyKey: "one-unit-return",
      lines: [
        { invoiceLineId: soldLine.id, quantity: "1", disposition: "RESTOCK" },
      ],
    });
    expect(await application.getInventoryValuation(ownerId)).toMatchObject({
      knownValueMinor: 400,
      unknownQuantityScaled: 0,
    });
    expect(
      await database.query(
        "SELECT quantity_scaled,unit_cost_minor FROM invoice_return_cost_layers WHERE invoice_line_id=$1",
        [soldLine.id],
      ),
    ).toMatchObject([{ quantity_scaled: 1, unit_cost_minor: 400 }]);

    const resale = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "one-unit-resale",
      lines: [{ productId, quantity: "1", discount: "0" }],
    });
    await application.postInvoice(ownerId, resale.id);
    const resaleLine = resale.lines[0];
    if (!resaleLine) throw new Error("Resale line missing.");
    expect(
      await database.query(
        "SELECT quantity_scaled,unit_cost_minor FROM invoice_line_cost_layers WHERE invoice_line_id=$1",
        [resaleLine.id],
      ),
    ).toMatchObject([{ quantity_scaled: 1, unit_cost_minor: 400 }]);
  });

  it("restores a partial return from multiple FIFO purchase layers at their original costs", async () => {
    const productId = await createProduct("Mixed FIFO return");
    const supplier = await application.saveSupplier(ownerId, {
      name: "Mixed FIFO supplier",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "MIX-LOW",
      idempotencyKey: "mixed-fifo-low",
      lines: [{ productId, quantity: "1", unitCost: "2.00" }],
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "MIX-HIGH",
      idempotencyKey: "mixed-fifo-high",
      lines: [{ productId, quantity: "2", unitCost: "5.00" }],
    });
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "mixed-fifo-sale",
      lines: [{ productId, quantity: "3", discount: "0" }],
    });
    await application.postInvoice(ownerId, invoice.id);
    const invoiceLine = invoice.lines[0];
    if (!invoiceLine) throw new Error("Invoice line missing.");
    expect(
      await database.query(
        "SELECT quantity_scaled,unit_cost_minor FROM invoice_line_cost_layers WHERE invoice_line_id=$1 ORDER BY layer_index",
        [invoiceLine.id],
      ),
    ).toMatchObject([
      { quantity_scaled: 1, unit_cost_minor: 200 },
      { quantity_scaled: 2, unit_cost_minor: 500 },
    ]);
    await application.returnInvoice(ownerId, invoice.id, {
      reason: "Return two units",
      refund: "0",
      idempotencyKey: "mixed-fifo-return",
      lines: [
        {
          invoiceLineId: invoiceLine.id,
          quantity: "2",
          disposition: "RESTOCK",
        },
      ],
    });
    expect(
      await database.query(
        "SELECT quantity_scaled,unit_cost_minor FROM invoice_return_cost_layers WHERE invoice_line_id=$1 ORDER BY layer_index",
        [invoiceLine.id],
      ),
    ).toMatchObject([
      { quantity_scaled: 1, unit_cost_minor: 200 },
      { quantity_scaled: 1, unit_cost_minor: 500 },
    ]);
    expect(await application.getInventoryValuation(ownerId)).toMatchObject({
      knownValueMinor: 700,
      unknownQuantityScaled: 0,
    });
    const report = await application.getSalesReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
    });
    expect(report).toMatchObject({
      costOfGoodsMinor: 500,
      grossProfitMinor: 1499,
    });
  });

  it("cancels and resells an invoice while preserving every FIFO layer", async () => {
    const productId = await createProduct("Cancelled multi-layer");
    const supplier = await application.saveSupplier(ownerId, {
      name: "Cancellation supplier",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "CANCEL-LOW",
      idempotencyKey: "cancel-layer-low",
      lines: [{ productId, quantity: "1", unitCost: "2.00" }],
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "CANCEL-HIGH",
      idempotencyKey: "cancel-layer-high",
      lines: [{ productId, quantity: "2", unitCost: "5.00" }],
    });
    const cancelled = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "cancel-multi-layer-sale",
      lines: [{ productId, quantity: "3", discount: "0" }],
    });
    await application.postInvoice(ownerId, cancelled.id);
    await application.cancelInvoice(
      ownerId,
      cancelled.id,
      "Test full cancellation",
    );
    expect(await application.getInventoryValuation(ownerId)).toMatchObject({
      knownValueMinor: 1200,
      unknownQuantityScaled: 0,
    });
    expect(
      await database.query(
        "SELECT quantity_delta_scaled,unit_cost_minor FROM stock_movements WHERE source_type='INVOICE_CANCELLATION' ORDER BY rowid",
        [],
      ),
    ).toMatchObject([
      { quantity_delta_scaled: 1, unit_cost_minor: 200 },
      { quantity_delta_scaled: 2, unit_cost_minor: 500 },
    ]);
    const resale = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "cancelled-stock-resale",
      lines: [{ productId, quantity: "3", discount: "0" }],
    });
    await application.postInvoice(ownerId, resale.id);
    const resaleLine = resale.lines[0];
    if (!resaleLine) throw new Error("Resale line missing.");
    expect(
      await database.query(
        "SELECT quantity_scaled,unit_cost_minor FROM invoice_line_cost_layers WHERE invoice_line_id=$1 ORDER BY layer_index",
        [resaleLine.id],
      ),
    ).toMatchObject([
      { quantity_scaled: 1, unit_cost_minor: 200 },
      { quantity_scaled: 2, unit_cost_minor: 500 },
    ]);
  });

  it("keeps returned unknown-cost stock unknown instead of assigning a replacement cost", async () => {
    const productId = await createProduct("Unknown restored layer");
    await stock(productId, "OPENING", "2", "unknown-restore-opening");
    const supplier = await application.saveSupplier(ownerId, {
      name: "Known layer supplier",
      contactName: "",
      phone: "",
      email: "",
      address: "",
    });
    await application.receivePurchase(ownerId, {
      supplierId: supplier.id,
      referenceNumber: "KNOWN-AFTER-UNKNOWN",
      idempotencyKey: "known-after-unknown-layer",
      lines: [{ productId, quantity: "2", unitCost: "5.00" }],
    });
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "sell-unknown-and-known",
      lines: [{ productId, quantity: "4", discount: "0" }],
    });
    await application.postInvoice(ownerId, invoice.id);
    const invoiceLine = invoice.lines[0];
    if (!invoiceLine) throw new Error("Invoice line missing.");
    await application.returnInvoice(ownerId, invoice.id, {
      reason: "Return unknown-cost units",
      refund: "0",
      idempotencyKey: "return-unknown-units",
      lines: [
        {
          invoiceLineId: invoiceLine.id,
          quantity: "2",
          disposition: "RESTOCK",
        },
      ],
    });
    expect(await application.getInventoryValuation(ownerId)).toMatchObject({
      knownValueMinor: 0,
      unknownQuantityScaled: 2,
    });
    const resale = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "resell-unknown-cost-units",
      lines: [{ productId, quantity: "2", discount: "0" }],
    });
    await application.postInvoice(ownerId, resale.id);
    const resaleLine = resale.lines[0];
    if (!resaleLine) throw new Error("Resale line missing.");
    expect(
      await database.query(
        "SELECT quantity_scaled,unit_cost_minor FROM invoice_line_cost_layers WHERE invoice_line_id=$1 ORDER BY layer_index",
        [resaleLine.id],
      ),
    ).toMatchObject([{ quantity_scaled: 2, unit_cost_minor: null }]);
    const report = await application.getSalesReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
    });
    expect(report.grossProfitMinor).toBeNull();
  });
});

describe("sales reports", () => {
  it("filters by posting dates and accounts for returns, payments, and cancellations", async () => {
    const productId = await createProduct();
    await stock(productId, "OPENING", "8", "stock-report-open-01");
    const posted = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "invoice-report-posted-01",
      lines: [{ productId, quantity: "2", discount: "0" }],
    });
    await application.postInvoice(ownerId, posted.id);
    await application.addInvoicePayment(ownerId, posted.id, {
      method: "CASH",
      amount: "10.00",
      reference: "",
      idempotencyKey: "payment-report-01",
    });
    const line = posted.lines[0];
    if (!line) throw new Error("Invoice line was not created.");
    await application.returnInvoice(ownerId, posted.id, {
      reason: "Returned one item",
      idempotencyKey: "return-report-01",
      refund: "3.00",
      lines: [
        { invoiceLineId: line.id, quantity: "1", disposition: "RESTOCK" },
      ],
    });
    const cancelled = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "invoice-report-cancelled-01",
      lines: [{ productId, quantity: "1", discount: "0" }],
    });
    await application.postInvoice(ownerId, cancelled.id);
    await application.cancelInvoice(
      ownerId,
      cancelled.id,
      "Duplicate test invoice",
    );

    const report = await application.getSalesReport(ownerId, {
      from: "2026-11-04T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
      groupBy: "day",
    });
    expect(report).toMatchObject({
      invoiceCount: 1,
      cancelledInvoiceCount: 1,
      grossSalesMinor: 3998,
      returnedMinor: 1999,
      netSalesMinor: 1999,
      netPaymentsMinor: 700,
      outstandingMinor: 1299,
    });
    expect(report.groups).toMatchObject([
      {
        period: "2026-11-04",
        invoiceCount: 1,
        cancelledInvoiceCount: 1,
        netSalesMinor: 1999,
        netPaymentsMinor: 700,
        outstandingMinor: 1299,
      },
    ]);
    expect(report.products).toMatchObject([
      { productId, quantityScaled: 1, netSalesMinor: 1999 },
    ]);
    expect(report.categories).toMatchObject([
      { categoryName: "Uncategorized", netSalesMinor: 1999 },
    ]);
    expect(application.exportSalesReportCsv(report)).toContain("SKU-TEA");
    await expect(
      application.getSalesReport(ownerId, {
        from: "2026-11-05T00:00:00.000Z",
        to: "2026-11-05T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("forward migration safety", () => {
  it("preserves existing movements and valuation through the current schema", async () => {
    const copiedDatabase = new TestSqliteDatabase();
    try {
      for (const migration of migrations.slice(0, 7)) {
        await copiedDatabase.executeScript(migration.sql);
      }
      const copiedApp = new SmartBizApplication(copiedDatabase, runtime(), 30);
      const owner = await copiedApp.setupBusiness(businessProfile, {
        ...ownerCredentials,
        email: "schema5-copy@example.test",
      });
      const unit = (await copiedApp.listUnits(owner.id)).find(
        (row) => row.code === "piece",
      );
      if (!unit) throw new Error("Seed unit missing.");
      const product = await copiedApp.saveProduct(owner.id, {
        name: "Legacy cost return",
        sku: "LEGACY-COST-1",
        description: "",
        taxCategory: "",
        hsnSacCode: "0902",
        categoryId: null,
        unitId: unit.id,
        purchasePrice: "4.00",
        sellingPrice: "19.99",
        reorderThreshold: "0",
      });
      const supplier = await copiedApp.saveSupplier(owner.id, {
        name: "Legacy cost supplier",
        contactName: "",
        phone: "",
        email: "",
        address: "",
      });
      await copiedApp.receivePurchase(owner.id, {
        supplierId: supplier.id,
        referenceNumber: "V5-COPY",
        idempotencyKey: "schema5-copy-purchase",
        lines: [{ productId: product.id, quantity: "2", unitCost: "4.00" }],
      });
      const invoice = await copiedApp.createInvoiceDraft(owner.id, {
        customerId: null,
        idempotencyKey: "schema5-copy-invoice",
        lines: [{ productId: product.id, quantity: "2", discount: "0" }],
      });
      await copiedApp.postInvoice(owner.id, invoice.id);
      await copiedApp.cancelInvoice(
        owner.id,
        invoice.id,
        "Prepare legacy migration fixture",
      );
      const before = await copiedDatabase.query<{ count: number }>(
        "SELECT count(*) AS count FROM stock_movements",
        [],
      );
      const legacy = await copiedDatabase.query<{
        unit_cost_minor: number | null;
      }>(
        "SELECT unit_cost_minor FROM stock_movements WHERE source_type='INVOICE_CANCELLATION'",
        [],
      );
      expect(legacy).toEqual([{ unit_cost_minor: 400 }]);

      await migrateDatabase(copiedDatabase);
      expect(await copiedDatabase.currentMigrationVersion()).toBe(migrations.length);
      expect(
        await copiedDatabase.query(
          "SELECT count(*) AS count FROM stock_movements",
          [],
        ),
      ).toEqual(before);
      expect(
        await copiedDatabase.query(
          "SELECT unit_cost_minor FROM stock_movements WHERE source_type='INVOICE_CANCELLATION'",
          [],
        ),
      ).toEqual(legacy);
      expect(await copiedApp.getInventoryValuation(owner.id)).toMatchObject({
        knownValueMinor: 800,
        unknownQuantityScaled: 0,
      });
    } finally {
      copiedDatabase.close();
    }
  });
});

describe("billing, stock, and customer history", () => {
  it("calculates customer sales and outstanding balance from returned items, refunds, and cancellations", async () => {
    const productId = await createProduct();
    const customer = await application.saveCustomer(ownerId, {
      name: "Asha Patil",
      phone: "+91 9876543210",
      email: "asha@example.test",
      address: "Pune",
    });
    await stock(productId, "OPENING", "5", "stock-customer-summary");

    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: customer.id,
      idempotencyKey: "invoice-customer-summary",
      lines: [{ productId, quantity: "3", discount: "0" }],
    });
    await application.postInvoice(ownerId, invoice.id);
    await application.addInvoicePayment(ownerId, invoice.id, {
      method: "CASH",
      amount: "20.00",
      reference: "",
      idempotencyKey: "payment-customer-summary",
    });
    const invoiceLine = invoice.lines[0];
    if (!invoiceLine) throw new Error("Invoice line was not created.");

    await application.returnInvoice(ownerId, invoice.id, {
      reason: "One unit returned, partial refund",
      idempotencyKey: "return-customer-summary",
      refund: "5.00",
      lines: [
        {
          invoiceLineId: invoiceLine.id,
          quantity: "1",
          disposition: "RESTOCK",
        },
      ],
    });
    expect(
      await application.getCustomerSalesSummary(ownerId, customer.id),
    ).toEqual({
      invoiceCount: 1,
      netSalesMinor: 3998,
      netPaidMinor: 1500,
      outstandingMinor: 2498,
    });

    await application.returnInvoice(ownerId, invoice.id, {
      reason: "One unit returned without a cash refund",
      idempotencyKey: "return-customer-no-refund",
      refund: "0",
      lines: [
        {
          invoiceLineId: invoiceLine.id,
          quantity: "1",
          disposition: "RESTOCK",
        },
      ],
    });
    expect(
      await application.getCustomerSalesSummary(ownerId, customer.id),
    ).toEqual({
      invoiceCount: 1,
      netSalesMinor: 1999,
      netPaidMinor: 1500,
      outstandingMinor: 499,
    });

    const cancelledInvoice = await application.createInvoiceDraft(ownerId, {
      customerId: customer.id,
      idempotencyKey: "invoice-customer-cancel",
      lines: [{ productId, quantity: "1", discount: "0" }],
    });
    await application.postInvoice(ownerId, cancelledInvoice.id);
    await application.cancelInvoice(
      ownerId,
      cancelledInvoice.id,
      "Customer summary cancellation test",
    );

    expect(
      await application.getCustomerSalesSummary(ownerId, customer.id),
    ).toEqual({
      invoiceCount: 1,
      netSalesMinor: 1999,
      netPaidMinor: 1500,
      outstandingMinor: 499,
    });
    expect(
      await application.getCustomerPurchaseHistory(ownerId, customer.id),
    ).toHaveLength(2);
  });

  it("calculates exact tax and discount, posts stock, records payments, and restocks returns", async () => {
    const productId = await createProduct("Tea", "food");
    const customer = await application.saveCustomer(ownerId, {
      name: "Asha Patil",
      phone: "+91 9876543210",
      email: "asha@example.test",
      address: "Pune",
    });
    await stock(productId, "OPENING", "10", "stock-open-bill01");
    await application.updateBusiness(ownerId, {
      ...businessProfile,
      taxEnabled: true,
      taxRegistrationId: "27AAPFU0939F1ZV",
      gstRegistrationType: "REGULAR",
      gstStateCode: "27",
      gstRegisteredAddress: "GST registered office, Pune",
    });
    const request = {
      customerId: customer.id,
      placeOfSupplyStateCode: "27",
      idempotencyKey: "invoice-request-0001",
      lines: [{ productId, quantity: "2", discount: "1.00" }],
    };
    await expect(
      application.createInvoiceDraft(ownerId, request),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await application.setTaxRate(ownerId, {
      categoryCode: "food",
      rateBasisPoints: 500,
      cessRateBasisPoints: 0,
      effectiveAt: "2026-01-01T00:00:00.000Z",
      sourceReference: "Example statutory rate reference",
      reason: "Configured test tax rate",
    });
    await expect(application.listTaxRates(ownerId)).resolves.toMatchObject([
      {
        categoryCode: "food",
        rateBasisPoints: 500,
        cessRateBasisPoints: 0,
        sourceReference: "Example statutory rate reference",
      },
    ]);

    const [invoice, duplicateDraft] = await Promise.all([
      application.createInvoiceDraft(ownerId, request),
      application.createInvoiceDraft(ownerId, request),
    ]);
    if (!invoice) throw new Error("Invoice draft was not created.");
    expect(invoice).toMatchObject({
      subtotalMinor: 3998,
      discountMinor: 100,
      taxMinor: 195,
      totalMinor: 4093,
      status: "DRAFT",
    });
    expect(duplicateDraft).toMatchObject({ id: invoice.id });

    const posted = await application.postInvoice(ownerId, invoice.id);
    expect(posted.status).toBe("POSTED");
    expect(
      (await application.listStockBalances(ownerId))[0]?.onHandScaled,
    ).toBe(8);
    await application.postInvoice(ownerId, invoice.id);
    expect(
      await application.listStockMovements(ownerId, productId),
    ).toHaveLength(2);

    const payment = {
      method: "CASH" as const,
      amount: "40.93",
      reference: "",
      idempotencyKey: "payment-request-001",
    };
    expect(
      await application.addInvoicePayment(ownerId, invoice.id, payment),
    ).toMatchObject({ paidMinor: 4093, dueMinor: 0 });
    await Promise.all([
      application.addInvoicePayment(ownerId, invoice.id, payment),
      application.addInvoicePayment(ownerId, invoice.id, payment),
    ]);
    await expect(
      application.addInvoicePayment(ownerId, invoice.id, {
        ...payment,
        amount: "0.01",
        idempotencyKey: "payment-request-overpay",
      }),
    ).rejects.toThrow(AppError);
    const afterRejectedPayment = await application.getInvoice(
      ownerId,
      invoice.id,
    );
    expect(afterRejectedPayment).toMatchObject({
      paidMinor: 4093,
      payments: [{ amountMinor: 4093 }],
    });
    expect(afterRejectedPayment.payments).toHaveLength(1);
    await expect(
      application.addInvoicePayment(ownerId, invoice.id, {
        ...payment,
        amount: "39.00",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await application.getInvoice(ownerId, invoice.id)).toMatchObject({
      paidMinor: 4093,
    });

    const line = invoice.lines[0];
    if (!line) throw new Error("Invoice line was not created.");
    const returnRequest = {
      reason: "Customer returned one item",
      idempotencyKey: "return-request-0001",
      refund: "20.47",
      lines: [
        {
          invoiceLineId: line.id,
          quantity: "1",
          disposition: "RESTOCK" as const,
        },
      ],
    };
    const returned = await application.returnInvoice(
      ownerId,
      invoice.id,
      returnRequest,
    );
    expect(returned.paidMinor).toBe(2046);
    const taxReversal = await database.query<{
      taxable_reversal_minor: number;
      gst_tax_reversal_minor: number;
      cgst_reversal_minor: number;
      sgst_reversal_minor: number;
    }>(
      `SELECT taxable_reversal_minor,gst_tax_reversal_minor,cgst_reversal_minor,sgst_reversal_minor
       FROM invoice_return_lines WHERE invoice_line_id=$1`,
      [line.id],
    );
    expect(taxReversal[0]?.taxable_reversal_minor).toBeGreaterThan(0);
    expect(taxReversal[0]?.gst_tax_reversal_minor).toBeGreaterThan(0);
    expect(
      (taxReversal[0]?.cgst_reversal_minor ?? 0) +
        (taxReversal[0]?.sgst_reversal_minor ?? 0),
    ).toBe(taxReversal[0]?.gst_tax_reversal_minor);
    expect(
      (await application.listStockBalances(ownerId))[0]?.onHandScaled,
    ).toBe(9);
    expect(
      await database.query<{ count: number }>(
        "SELECT count(*) AS count FROM invoice_returns WHERE idempotency_key = $1",
        ["return-request-excess"],
      ),
    ).toEqual([{ count: 0 }]);
    await expect(
      application.returnInvoice(ownerId, invoice.id, {
        reason: "Return more than the remaining quantity",
        idempotencyKey: "return-request-excess",
        refund: "0",
        lines: [
          {
            invoiceLineId: line.id,
            quantity: "2",
            disposition: "RESTOCK",
          },
        ],
      }),
    ).rejects.toThrow(AppError);
    expect(
      (await application.listStockBalances(ownerId))[0]?.onHandScaled,
    ).toBe(9);
    await Promise.all([
      application.returnInvoice(ownerId, invoice.id, returnRequest),
      application.returnInvoice(ownerId, invoice.id, returnRequest),
    ]);
    await expect(
      application.cancelInvoice(ownerId, invoice.id, "after return"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await application.listStockMovements(ownerId, productId),
    ).toHaveLength(3);
    expect(
      (await application.getCustomerPurchaseHistory(ownerId, customer.id)).map(
        (row) => row.id,
      ),
    ).toContain(invoice.id);
    expect(
      await application.getCustomerSalesSummary(ownerId, customer.id),
    ).toEqual({
      invoiceCount: 1,
      netSalesMinor: 2046,
      netPaidMinor: 2046,
      outstandingMinor: 0,
    });
  });

  it("rolls back invoice posting when stock is insufficient", async () => {
    const productId = await createProduct();
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "invoice-no-stock-001",
      lines: [{ productId, quantity: "1", discount: "0" }],
    });

    await expect(
      application.postInvoice(ownerId, invoice.id),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      field: "stock.negative_stock",
      message: expect.stringContaining("make stock negative"),
    });
    expect((await application.getInvoice(ownerId, invoice.id)).status).toBe(
      "DRAFT",
    );
    expect(
      (await application.listStockBalances(ownerId))[0]?.onHandScaled,
    ).toBe(0);
  });

  it("rolls back all stock deductions when duplicate product lines exceed stock", async () => {
    const productId = await createProduct();
    await stock(productId, "OPENING", "3", "stock-opening-multi1");
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "invoice-multi-line-001",
      lines: [
        { productId, quantity: "2", discount: "0" },
        { productId, quantity: "2", discount: "0" },
      ],
    });

    await expect(application.postInvoice(ownerId, invoice.id)).rejects.toThrow(
      AppError,
    );
    expect((await application.getInvoice(ownerId, invoice.id)).status).toBe(
      "DRAFT",
    );
    expect(
      (await application.listStockBalances(ownerId))[0]?.onHandScaled,
    ).toBe(3);
    expect(
      await application.listStockMovements(ownerId, productId),
    ).toHaveLength(1);
  });

  it("cancels a posted invoice with ledger restock and an immutable payment reversal", async () => {
    const productId = await createProduct();
    await stock(productId, "OPENING", "5", "stock-open-cancel1");
    const invoice = await application.createInvoiceDraft(ownerId, {
      customerId: null,
      idempotencyKey: "invoice-cancel-0001",
      lines: [{ productId, quantity: "2", discount: "0" }],
    });
    await application.postInvoice(ownerId, invoice.id);
    await application.addInvoicePayment(ownerId, invoice.id, {
      method: "UPI",
      amount: "39.98",
      reference: "test",
      idempotencyKey: "payment-cancel-001",
    });

    const cancelled = await application.cancelInvoice(
      ownerId,
      invoice.id,
      "Voided before fulfillment",
    );
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      paidMinor: 0,
      dueMinor: 0,
    });
    expect(
      (await application.listStockBalances(ownerId))[0]?.onHandScaled,
    ).toBe(5);
    await application.cancelInvoice(
      ownerId,
      invoice.id,
      "Voided before fulfillment",
    );
    expect(
      await application.listStockMovements(ownerId, productId),
    ).toHaveLength(3);
    expect(
      (await application.getInvoice(ownerId, invoice.id)).payments,
    ).toHaveLength(2);
    await expect(
      database.execute("DELETE FROM payments WHERE invoice_id = $1", [
        invoice.id,
      ]),
    ).rejects.toThrow(/append_only/i);
  });
});
