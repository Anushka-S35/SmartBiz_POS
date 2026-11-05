import type { BarcodeSymbology } from "./models";
import { AppError } from "./errors";

export function validateBarcode(
  value: string,
  symbology: BarcodeSymbology,
): string {
  const normalized = value.trim();
  if (!normalized)
    throw new AppError("VALIDATION", "Enter a barcode value.", "barcode");

  if (symbology === "EAN13") {
    if (!/^\d{13}$/.test(normalized)) {
      throw new AppError(
        "VALIDATION",
        "EAN-13 barcodes must contain exactly 13 digits.",
        "barcode",
      );
    }
    if (!hasValidEan13CheckDigit(normalized)) {
      throw new AppError(
        "VALIDATION",
        "The EAN-13 check digit is invalid.",
        "barcode",
      );
    }
    return normalized;
  }

  if (
    symbology !== "CODE128" ||
    normalized.length > 80 ||
    !/^[\x20-\x7e]+$/.test(normalized)
  ) {
    throw new AppError(
      "VALIDATION",
      "Code 128 supports 1 to 80 printable ASCII characters.",
      "barcode",
    );
  }
  return normalized;
}

export function hasValidEan13CheckDigit(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce((total, character, index) => {
    const digit = Number(character);
    return total + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(value[12]);
}

export function generateInternalBarcode(uuid: string): string {
  const normalizedUuid = uuid.replaceAll("-", "").toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(normalizedUuid)) {
    throw new AppError(
      "VALIDATION",
      "The offline identifier source did not return a valid UUID.",
    );
  }
  return `SB${normalizedUuid}`;
}
