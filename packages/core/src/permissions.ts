import type { UserRole } from "./models";
import { AppError } from "./errors";

export type Permission =
  | "business.read"
  | "business.update"
  | "users.read"
  | "users.manage"
  | "categories.manage"
  | "units.manage"
  | "products.read"
  | "products.manage"
  | "products.import"
  | "products.export"
  | "barcodes.manage"
  | "inventory.read"
  | "inventory.manage"
  | "customers.read"
  | "customers.manage"
  | "suppliers.read"
  | "suppliers.manage"
  | "purchasing.read"
  | "purchasing.manage"
  | "billing.read"
  | "billing.create"
  | "billing.cancel"
  | "tax.manage";

const rolePermissions: Record<UserRole, ReadonlySet<Permission>> = {
  ADMIN: new Set([
    "business.read",
    "business.update",
    "users.read",
    "users.manage",
    "categories.manage",
    "units.manage",
    "products.read",
    "products.manage",
    "products.import",
    "products.export",
    "barcodes.manage",
    "inventory.read",
    "inventory.manage",
    "customers.read",
    "customers.manage",
    "suppliers.read",
    "suppliers.manage",
    "purchasing.read",
    "purchasing.manage",
    "billing.read",
    "billing.create",
    "billing.cancel",
    "tax.manage",
  ]),
  MANAGER: new Set([
    "business.read",
    "categories.manage",
    "units.manage",
    "products.read",
    "products.manage",
    "products.import",
    "products.export",
    "barcodes.manage",
    "inventory.read",
    "inventory.manage",
    "customers.read",
    "customers.manage",
    "suppliers.read",
    "suppliers.manage",
    "purchasing.read",
    "purchasing.manage",
    "billing.read",
    "billing.create",
  ]),
  CASHIER: new Set([
    "products.read",
    "inventory.read",
    "customers.read",
    "billing.read",
    "billing.create",
  ]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export function assertPermission(role: UserRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AppError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
    );
  }
}
