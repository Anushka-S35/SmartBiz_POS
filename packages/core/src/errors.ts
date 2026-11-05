export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SETUP_INCOMPLETE"
  | "UNSUPPORTED_PLATFORM"
  | "PERSISTENCE";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:UNIQUE|FOREIGN KEY|CHECK) constraint failed|barcode\.|users\.last_active_admin|product\.invalid_catalogue_reference|stock\.|invoice\.|payment\.|return\.|tax_rates\.|invoice_returns\.|invoice_return_lines\./i.test(
    message,
  );
}

export function persistenceConflict(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("stock.negative_stock")) {
    return new AppError(
      "CONFLICT",
      "This movement would make stock negative. Record available stock first or reduce the quantity.",
      "stock.negative_stock",
    );
  }
  if (message.includes("invoice.empty")) {
    return new AppError(
      "VALIDATION",
      "An invoice must contain at least one item.",
    );
  }
  if (message.includes("invoice.totals_mismatch")) {
    return new AppError(
      "CONFLICT",
      "Invoice totals do not match its saved item details.",
    );
  }
  if (message.includes("payment.exceeds_due")) {
    return new AppError("VALIDATION", "Payment cannot exceed the amount due.");
  }
  if (message.includes("payment.refund_exceeds_paid")) {
    return new AppError("VALIDATION", "Refund cannot exceed the amount paid.");
  }
  if (message.includes("return.quantity_exceeds_sold")) {
    return new AppError(
      "VALIDATION",
      "Returned quantity cannot exceed the unreturned quantity sold.",
    );
  }
  if (message.includes("invoice.cancellation_reason_required")) {
    return new AppError("VALIDATION", "Enter a reason to cancel this invoice.");
  }
  if (message.includes("invoice.cancel_after_return")) {
    return new AppError(
      "CONFLICT",
      "An invoice with recorded returns cannot be cancelled. Continue with return records instead.",
    );
  }
  if (message.includes("invoice.invalid_status_transition")) {
    return new AppError(
      "CONFLICT",
      "This invoice status transition is not allowed.",
    );
  }
  if (message.includes("invoice.tax_disabled")) {
    return new AppError(
      "VALIDATION",
      "Tax cannot be applied while tax mode is disabled.",
    );
  }
  if (
    message.includes("stock_movements.append_only") ||
    message.includes("invoice_lines.append_only") ||
    message.includes("payments.append_only") ||
    message.includes("invoices.append_only") ||
    message.includes("invoice_returns.append_only") ||
    message.includes("invoice_return_lines.append_only") ||
    message.includes("tax_rates.append_only")
  ) {
    return new AppError(
      "CONFLICT",
      "Posted inventory and financial records cannot be edited or deleted.",
    );
  }
  if (message.includes("idx_businesses_single_installation")) {
    return new AppError(
      "CONFLICT",
      "A business profile already exists on this installation.",
    );
  }
  if (message.includes("users.last_active_admin")) {
    return new AppError(
      "CONFLICT",
      "The business must keep at least one active administrator.",
    );
  }
  if (message.includes("barcode.multiple_aliases_disabled")) {
    return new AppError(
      "CONFLICT",
      "This business does not allow more than one active barcode per product.",
    );
  }
  if (message.includes("barcode.replacement_not_active")) {
    return new AppError(
      "CONFLICT",
      "The barcode being replaced is no longer active.",
    );
  }
  if (message.includes("product.invalid_catalogue_reference")) {
    return new AppError(
      "VALIDATION",
      "Choose an active category and unit from this business.",
    );
  }
  if (message.includes("FOREIGN KEY")) {
    return new AppError(
      "CONFLICT",
      "This record is still in use and cannot be removed.",
    );
  }
  return new AppError(
    "CONFLICT",
    "A record with the same value already exists.",
  );
}

export function validationError(message: string, field?: string): AppError {
  return new AppError("VALIDATION", message, field);
}
