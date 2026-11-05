import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppError,
  SmartBizApplication,
  formatMinorUnits,
  generateInternalBarcode,
  hasPermission,
  migrateDatabase,
  type Migration,
  parseMoneyToMinorUnits,
  parseQuantityToScaledInteger,
  validateBarcode,
} from "./index";
import type { Runtime } from "./models";
import { migrations } from "./migrations";
import { TestSqliteDatabase } from "./testing/sqlite";

const businessProfile = {
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

async function createProduct(name = "Tea"): Promise<string> {
  const units = await application.listUnits(ownerId);
  const piece = units.find((unit) => unit.code === "piece");
  if (!piece) throw new Error("Seed unit was not created.");
  const product = await application.saveProduct(ownerId, {
    name,
    sku: `SKU-${name.toUpperCase().replaceAll(" ", "-")}`,
    description: "",
    taxCategory: "",
    categoryId: null,
    unitId: piece.id,
    purchasePrice: "12.35",
    sellingPrice: "19.99",
    reorderThreshold: "3",
  });
  return product.id;
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

describe("exact money and quantity values", () => {
  it("keeps the Expo migration bundle byte-for-byte aligned with the Tauri SQL migration", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "packages/core/migrations/0001_initial.sql"),
      "utf8",
    );
    const migration: Migration | undefined = migrations[0];
    expect(migration?.sql).toBe(sql);
  });

  it("keeps the supplier/purchase migration bundle aligned with its SQL source", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "packages/core/migrations/0004_suppliers_purchases.sql",
      ),
      "utf8",
    );
    expect(migrations[3]?.sql.trim()).toBe(sql.trim());
  });

  it("keeps the inventory and billing migration bundle aligned with its SQL source", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "packages/core/migrations/0003_inventory_customers_billing.sql",
      ),
      "utf8",
    );
    expect(migrations[2]?.sql).toBe(sql);
  });

  it("keeps the FIFO restoration migration aligned with its Tauri SQL source", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "packages/core/migrations/0006_fifo_cost_layer_restoration.sql",
      ),
      "utf8",
    );
    expect(migrations[5]?.sql.trim()).toBe(sql.trim());
  });

  it("upgrades an existing schema and prevents multiple businesses per installation", async () => {
    const upgradeDatabase = new TestSqliteDatabase();
    try {
      await upgradeDatabase.executeScript(migrations[0]!.sql);
      expect(await upgradeDatabase.currentMigrationVersion()).toBe(1);

      await migrateDatabase(upgradeDatabase);

      expect(await upgradeDatabase.currentMigrationVersion()).toBe(6);
      const indexes = await upgradeDatabase.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = $1",
        ["idx_businesses_single_installation"],
      );
      expect(indexes).toHaveLength(1);
      const tables = await upgradeDatabase.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = $1",
        ["stock_movements"],
      );
      expect(tables).toHaveLength(1);
      expect(migrations[1]?.sql).toBe(
        readFileSync(
          resolve(
            process.cwd(),
            "packages/core/migrations/0002_single_business_installation.sql",
          ),
          "utf8",
        ),
      );
    } finally {
      upgradeDatabase.close();
    }
  });

  it("uses the same SQLite database URL for Tauri loading and Tauri migrations", () => {
    const driver = readFileSync(
      resolve(process.cwd(), "apps/mobile/src/database-driver.web.ts"),
      "utf8",
    );
    const desktop = readFileSync(
      resolve(process.cwd(), "apps/desktop/src-tauri/src/lib.rs"),
      "utf8",
    );
    const configuration = readFileSync(
      resolve(process.cwd(), "apps/desktop/src-tauri/tauri.conf.json"),
      "utf8",
    );

    expect(driver).toContain('TauriDatabase.load("sqlite:smartbiz.db")');
    expect(desktop).toContain(
      '.add_migrations("sqlite:smartbiz.db", migrations)',
    );
    expect(configuration).toContain('"identifier": "com.smartbiz.pos"');
  });

  it("reports standalone browser storage as unsupported instead of implying desktop data is unavailable", async () => {
    vi.stubGlobal("window", {});
    try {
      const { openApplicationDatabase } =
        await import("../../../apps/mobile/src/database-driver.web");
      await expect(openApplicationDatabase()).rejects.toMatchObject({
        code: "UNSUPPORTED_PLATFORM",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("detects first launch, persists one administrator, accepts its password, and rejects an invalid password", async () => {
    const freshDatabase = new TestSqliteDatabase();
    try {
      await migrateDatabase(freshDatabase);
      const freshApplication = new SmartBizApplication(
        freshDatabase,
        runtime(),
        30,
      );
      expect(await freshApplication.getSetupState()).toEqual({
        businessExists: false,
        setupComplete: false,
      });

      const owner = await freshApplication.setupBusiness(
        businessProfile,
        ownerCredentials,
      );
      expect(await freshApplication.getSetupState()).toEqual({
        businessExists: true,
        setupComplete: true,
      });

      const rows = await freshDatabase.query<{
        business_count: number;
        admin_count: number;
        linked_admin_count: number;
      }>(
        `SELECT (SELECT count(*) FROM businesses) AS business_count,
          (SELECT count(*) FROM users WHERE role = 'ADMIN' AND disabled_at IS NULL) AS admin_count,
          (SELECT count(*) FROM users u JOIN businesses b ON b.id = u.business_id
           WHERE u.role = 'ADMIN' AND u.id = $1 AND b.setup_complete = 1) AS linked_admin_count`,
        [owner.id],
      );
      expect(rows[0]).toEqual({
        business_count: 1,
        admin_count: 1,
        linked_admin_count: 1,
      });

      const restarted = new SmartBizApplication(freshDatabase, runtime(), 30);
      await expect(
        restarted.login(ownerCredentials.email, "Definitely-wrong-password-8"),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      const session = await restarted.login(
        ` ${ownerCredentials.email.toUpperCase()} `,
        ownerCredentials.password,
      );
      expect(session.user).toMatchObject({
        id: owner.id,
        businessId: owner.businessId,
        role: "ADMIN",
      });
      expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
      expect(await restarted.getSetupState()).toEqual({
        businessExists: true,
        setupComplete: true,
      });
    } finally {
      freshDatabase.close();
    }
  }, 30_000);

  it("parses and formats money without floating-point arithmetic", () => {
    expect(parseMoneyToMinorUnits("999999999999.99", 2)).toBe(
      99_999_999_999_999,
    );
    expect(formatMinorUnits(1999, "INR", "en-IN", 2)).toContain("19.99");
    expect(() => parseMoneyToMinorUnits("1.001", 2)).toThrow(AppError);
    expect(() => parseMoneyToMinorUnits("-0.01", 2)).toThrow(AppError);
  });

  it("enforces unit precision for fractional quantities", () => {
    expect(parseQuantityToScaledInteger("1.25", 3)).toBe(1250);
    expect(() => parseQuantityToScaledInteger("1.001", 2)).toThrow(AppError);
    expect(() => parseQuantityToScaledInteger("0.5", 0)).toThrow(AppError);
  });
});

describe("barcode rules", () => {
  it("checks supported formats and never presents the internal value as a GTIN", () => {
    expect(validateBarcode("4006381333931", "EAN13")).toBe("4006381333931");
    expect(() => validateBarcode("4006381333932", "EAN13")).toThrow(
      /check digit/i,
    );
    expect(validateBarcode("SB123ABC", "CODE128")).toBe("SB123ABC");
    expect(
      generateInternalBarcode("00000000-0000-4000-8000-000000000001"),
    ).toBe("SB00000000000040008000000000000001");
    expect(() => validateBarcode("é", "CODE128")).toThrow(AppError);
  });
});

describe("business and catalogue application services", () => {
  it("allows only one concurrent first-run business setup", async () => {
    const freshDatabase = new TestSqliteDatabase();
    try {
      await migrateDatabase(freshDatabase);
      const freshApplication = new SmartBizApplication(
        freshDatabase,
        runtime(),
        30,
      );
      const results = await Promise.allSettled([
        freshApplication.setupBusiness(businessProfile, ownerCredentials),
        freshApplication.setupBusiness(businessProfile, {
          ...ownerCredentials,
          email: "second-owner@smartbiz.example",
        }),
      ]);

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toMatchObject({
          code: "CONFLICT",
          message: "A business profile already exists on this installation.",
        });
      }
      const businesses = await freshDatabase.query<{ count: number }>(
        "SELECT count(*) AS count FROM businesses",
      );
      const users = await freshDatabase.query<{ count: number }>(
        "SELECT count(*) AS count FROM users",
      );
      expect(businesses[0]?.count).toBe(1);
      expect(users[0]?.count).toBe(1);
    } finally {
      freshDatabase.close();
    }
  }, 20_000);

  it("persists business settings, default units and products in SQLite", async () => {
    const categories = await application.listCategories(ownerId);
    const category = await application.saveCategory(ownerId, { name: "चहा" });
    expect(categories).toHaveLength(0);
    const units = await application.listUnits(ownerId);
    const piece = units.find((unit) => unit.code === "piece");
    if (!piece) throw new Error("Seed unit was not created.");
    const product = await application.saveProduct(ownerId, {
      name: "चहा पावडर",
      sku: "TEA-01",
      description: "Loose tea",
      taxCategory: "",
      categoryId: category.id,
      unitId: piece.id,
      purchasePrice: "25.50",
      sellingPrice: "40.00",
      reorderThreshold: "2",
    });

    expect(product.purchasePriceMinor).toBe(2550);
    expect(product.sellingPriceMinor).toBe(4000);
    const restarted = new SmartBizApplication(database, runtime(), 30);
    await expect(
      restarted.listProducts(ownerId, { search: "पावडर" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await restarted.login(ownerCredentials.email, ownerCredentials.password);
    const persisted = await restarted.listProducts(ownerId, {
      search: "पावडर",
    });
    expect(persisted.map((item) => item.id)).toEqual([product.id]);
    expect(persisted[0]?.categoryName).toBe("चहा");
  });

  it("requires a tax registration ID only when tax is enabled", async () => {
    await expect(
      application.updateBusiness(ownerId, {
        ...businessProfile,
        taxEnabled: true,
        taxRegistrationId: "",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const updated = await application.updateBusiness(ownerId, {
      ...businessProfile,
      taxEnabled: true,
      taxRegistrationId: "GSTIN-EXAMPLE",
    });
    expect(updated.taxEnabled).toBe(true);
    expect(updated.taxRegistrationId).toBe("GSTIN-EXAMPLE");
  });

  it("rejects duplicate SKUs and malformed prices", async () => {
    await createProduct("Tea");
    await expect(
      application.saveProduct(ownerId, {
        name: "Other tea",
        sku: "sku-tea",
        description: "",
        taxCategory: "",
        categoryId: null,
        unitId: (await application.listUnits(ownerId))[0]?.id ?? "",
        purchasePrice: "1.001",
        sellingPrice: "2.00",
        reorderThreshold: "1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      application.saveProduct(ownerId, {
        name: "Other tea",
        sku: "sku-tea",
        description: "",
        taxCategory: "",
        categoryId: null,
        unitId:
          (await application.listUnits(ownerId)).find(
            (unit) => unit.code === "piece",
          )?.id ?? "",
        purchasePrice: "1.00",
        sellingPrice: "2.00",
        reorderThreshold: "1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces role checks in application services and blocks disabled accounts", async () => {
    const cashier = await application.createUser(ownerId, {
      email: "cashier@smartbiz.example",
      displayName: "Cashier",
      password: "Cashier-strong-password-77",
      role: "CASHIER",
    });
    expect(hasPermission("CASHIER", "products.manage")).toBe(false);
    await application.login(cashier.email, "Cashier-strong-password-77");
    await expect(application.listProducts(ownerId)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await application.login(cashier.email, "Cashier-strong-password-77");
    await expect(
      application.saveCategory(cashier.id, { name: "Blocked" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await application.login(ownerCredentials.email, ownerCredentials.password);
    await application.setUserDisabled(ownerId, cashier.id, true);
    await expect(
      application.login(cashier.email, "Cashier-strong-password-77"),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  }, 30_000);

  it("issues sessions that can be refreshed only before expiry", async () => {
    const session = await application.login(
      ownerCredentials.email,
      ownerCredentials.password,
    );
    expect(
      await application.refreshSession(ownerId, session.expiresAt),
    ).toMatchObject({
      id: ownerId,
      role: "ADMIN",
    });
    await expect(
      application.refreshSession(
        ownerId,
        new Date(Date.now() - 1).toISOString(),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("expires the service session even if a caller retains the user ID", async () => {
    const shortSessionApplication = new SmartBizApplication(
      database,
      runtime(),
      5,
    );
    await shortSessionApplication.login(
      ownerCredentials.email,
      ownerCredentials.password,
    );

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
      await expect(
        shortSessionApplication.listProducts(ownerId),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires a live authenticated session for each protected operation", async () => {
    await application.login(ownerCredentials.email, ownerCredentials.password);
    await application.logout();

    await expect(application.listProducts(ownerId)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("requires a remaining active administrator", async () => {
    await expect(
      application.setUserDisabled(ownerId, ownerId, true),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      application.updateUserRole(ownerId, ownerId, "MANAGER"),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("archives categories without deleting product meaning", async () => {
    const category = await application.saveCategory(ownerId, {
      name: "Beverages",
    });
    const units = await application.listUnits(ownerId);
    const piece = units.find((unit) => unit.code === "piece");
    if (!piece) throw new Error("Seed unit was not created.");
    const product = await application.saveProduct(ownerId, {
      name: "Tea",
      sku: "TEA",
      description: "",
      taxCategory: "",
      categoryId: category.id,
      unitId: piece.id,
      purchasePrice: "1",
      sellingPrice: "2",
      reorderThreshold: "0",
    });
    await application.setCategoryArchived(ownerId, category.id, true);
    expect((await application.listProducts(ownerId))[0]?.categoryName).toBe(
      "Beverages",
    );
    expect(product.categoryId).toBe(category.id);
  });

  it("imports valid CSV rows and reports invalid rows individually", async () => {
    const csv = [
      "name,sku,description,taxCategory,category,unit,purchasePrice,sellingPrice,reorderThreshold",
      "Tea,TEA-CSV,,, ,piece,1.00,2.50,1",
      "Bad,BAD-CSV,,, ,unknown,1.00,2.50,1",
    ].join("\n");
    const preview = await application.previewProductsCsv(ownerId, csv);
    expect(preview).toHaveLength(2);
    expect(preview[0]?.error).toBeNull();
    expect(preview[1]?.error).toMatch(/unit/i);

    const result = await application.importProductsCsv(ownerId, csv);
    expect(result.importedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(await application.exportProductsCsv(ownerId)).toContain("TEA-CSV");
  });
});

describe("barcode persistence and history", () => {
  it("generates distinct offline internal barcode previews", async () => {
    const productId = await createProduct();
    const previews = await Promise.all(
      Array.from({ length: 50 }, () =>
        application.generateBarcodePreview(ownerId, productId),
      ),
    );
    expect(new Set(previews.map((preview) => preview.value)).size).toBe(50);
    expect(previews.every((preview) => preview.symbology === "CODE128")).toBe(
      true,
    );
  });

  it("stores assignment and remap history and refuses retired-code reuse", async () => {
    const productId = await createProduct();
    const preview = await application.generateBarcodePreview(
      ownerId,
      productId,
    );
    expect(preview.symbology).toBe("CODE128");
    await application.assignBarcode(ownerId, productId, preview);
    await expect(
      application.assignBarcode(ownerId, productId, preview),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await application.remapBarcode(
      ownerId,
      productId,
      { value: "4006381333931", symbology: "EAN13" },
      "Supplier changed packaging",
    );
    const history = await application.getBarcodeHistory(ownerId, productId);
    expect(history.map((item) => item.eventType)).toEqual([
      "REMAPPED",
      "ASSIGNED",
    ]);
    expect(history[0]?.previousValue).toBe(preview.value);
    expect(history[0]?.reason).toBe("Supplier changed packaging");
    await expect(
      application.assignBarcode(
        ownerId,
        await createProduct("Another product"),
        preview,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
