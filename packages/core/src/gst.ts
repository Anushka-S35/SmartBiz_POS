import { AppError } from "./errors";

export type GstSupplyType = "TAXABLE" | "EXEMPT" | "NIL_RATED" | "NON_GST";
export type GstPricingMode = "EXCLUSIVE" | "INCLUSIVE";
export type { GstRegistrationType } from "./models";

export interface GstLineInput {
  amountMinor: number;
  discountMinor?: number;
  supplyType: GstSupplyType;
  pricingMode: GstPricingMode;
  gstRateBasisPoints: number;
  cessRateBasisPoints?: number;
  supplierStateCode: string;
  placeOfSupplyStateCode: string;
}

export interface GstLineResult {
  supplyType: GstSupplyType;
  pricingMode: GstPricingMode;
  taxableValueMinor: number;
  discountMinor: number;
  gstRateBasisPoints: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  cessMinor: number;
  totalTaxMinor: number;
  totalMinor: number;
}

const MAX_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

function checkedMinor(value: bigint): number {
  if (value < 0n || value > MAX_MINOR)
    throw new AppError(
      "VALIDATION",
      "GST amount is outside the supported range.",
    );
  return Number(value);
}

function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n)
    throw new AppError("VALIDATION", "Invalid GST divisor.");
  return (numerator + denominator / 2n) / denominator;
}

function assertRate(rate: number, field: string): void {
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000)
    throw new AppError(
      "VALIDATION",
      "Enter a valid configured tax rate.",
      field,
    );
}

function assertStateCode(value: string, field: string): void {
  if (!/^\d{2}$/.test(value))
    throw new AppError(
      "VALIDATION",
      "A two-digit state code is required to calculate GST.",
      field,
    );
}

/**
 * Calculates line GST from explicitly supplied tax configuration and place of supply.
 * This does not determine place of supply, GST eligibility, or statutory treatment.
 */
export function calculateGstLine(input: GstLineInput): GstLineResult {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0)
    throw new AppError(
      "VALIDATION",
      "Enter a valid line amount.",
      "amountMinor",
    );
  const discountMinor = input.discountMinor ?? 0;
  if (
    !Number.isSafeInteger(discountMinor) ||
    discountMinor < 0 ||
    discountMinor > input.amountMinor
  )
    throw new AppError(
      "VALIDATION",
      "Discount must be between zero and the line amount.",
      "discountMinor",
    );
  assertRate(input.gstRateBasisPoints, "gstRateBasisPoints");
  const cessRateBasisPoints = input.cessRateBasisPoints ?? 0;
  assertRate(cessRateBasisPoints, "cessRateBasisPoints");
  assertStateCode(input.supplierStateCode, "supplierStateCode");
  assertStateCode(input.placeOfSupplyStateCode, "placeOfSupplyStateCode");

  const net = BigInt(input.amountMinor - discountMinor);
  const gstRate = BigInt(input.gstRateBasisPoints);
  const cessRate = BigInt(cessRateBasisPoints);
  let taxable: bigint;
  let gst: bigint;
  let cess: bigint;

  if (input.supplyType !== "TAXABLE") {
    if (
      input.supplyType === "NON_GST" &&
      (input.gstRateBasisPoints !== 0 || cessRateBasisPoints !== 0)
    )
      throw new AppError(
        "VALIDATION",
        "Non-GST supplies cannot have configured GST or cess.",
      );
    taxable = net;
    gst = 0n;
    cess = 0n;
  } else if (input.pricingMode === "INCLUSIVE") {
    const denominator = 10_000n + gstRate + cessRate;
    taxable = roundRatio(net * 10_000n, denominator);
    const totalInclusiveTax = net - taxable;
    cess = roundRatio(taxable * cessRate, 10_000n);
    gst = totalInclusiveTax - cess;
  } else {
    taxable = net;
    gst = roundRatio(taxable * gstRate, 10_000n);
    cess = roundRatio(taxable * cessRate, 10_000n);
  }

  const intrastate = input.supplierStateCode === input.placeOfSupplyStateCode;
  const cgst = intrastate ? gst / 2n : 0n;
  const sgst = intrastate ? gst - cgst : 0n;
  const igst = intrastate ? 0n : gst;
  const totalTax = gst + cess;
  const total =
    input.pricingMode === "INCLUSIVE" && input.supplyType === "TAXABLE"
      ? net
      : taxable + totalTax;

  return {
    supplyType: input.supplyType,
    pricingMode: input.pricingMode,
    taxableValueMinor: checkedMinor(taxable),
    discountMinor,
    gstRateBasisPoints: input.gstRateBasisPoints,
    cgstMinor: checkedMinor(cgst),
    sgstMinor: checkedMinor(sgst),
    igstMinor: checkedMinor(igst),
    cessMinor: checkedMinor(cess),
    totalTaxMinor: checkedMinor(totalTax),
    totalMinor: checkedMinor(total),
  };
}

/** Format and checksum check only; this does not verify registration status on GSTN. */
export function hasValidGstinStructure(value: string): boolean {
  const gstin = value.trim().toUpperCase();
  if (
    !/^(0[1-9]|[1-2]\d|3[0-8]|97)[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
      gstin,
    )
  )
    return false;
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const value = alphabet.indexOf(gstin[index] ?? "");
    if (value < 0) return false;
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return gstin[14] === alphabet[(36 - (sum % 36)) % 36];
}

/** HSN/SAC field shape check only. Classification must be selected from a current authoritative tariff. */
export function hasValidHsnSacStructure(value: string): boolean {
  return /^(?:\d{4}|\d{6}|\d{8})$/.test(value.trim());
}
