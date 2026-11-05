import { AppError } from "./errors";

const MAX_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

export function getCurrencyFractionDigits(currencyCode: string): number {
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits;
    if (digits === undefined)
      throw new RangeError("Currency has no minor-unit configuration.");
    return digits;
  } catch {
    throw new AppError(
      "VALIDATION",
      "Choose a supported currency code.",
      "currencyCode",
    );
  }
}

export function minorUnitsToDecimal(
  amount: number,
  fractionDigits: number,
): string {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    fractionDigits < 0 ||
    fractionDigits > 3
  ) {
    throw new AppError(
      "VALIDATION",
      "Stored money amount is outside the supported range.",
    );
  }
  const scale = 10n ** BigInt(fractionDigits);
  const value = BigInt(amount);
  const whole = (value / scale).toString();
  if (fractionDigits === 0) return whole;
  const fraction = (value % scale).toString().padStart(fractionDigits, "0");
  return `${whole}.${fraction}`;
}

export function parseMoneyToMinorUnits(
  input: string,
  fractionDigits = 2,
): number {
  const value = input.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new AppError(
      "VALIDATION",
      "Enter a non-negative amount using digits and a decimal point.",
      "price",
    );
  }

  const fraction = match[2] ?? "";
  if (fraction.length > fractionDigits) {
    throw new AppError(
      "VALIDATION",
      `Use no more than ${fractionDigits} decimal places.`,
      "price",
    );
  }

  const scale = 10n ** BigInt(fractionDigits);
  const whole = BigInt(match[1] ?? "0");
  const fractional = BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  const minorUnits = whole * scale + fractional;
  if (minorUnits > MAX_MINOR_UNITS) {
    throw new AppError("VALIDATION", "The amount is too large.", "price");
  }
  return Number(minorUnits);
}

export function formatMinorUnits(
  amount: number,
  currencyCode: string,
  locale: string,
  fractionDigits = 2,
): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new AppError(
      "VALIDATION",
      "Stored money amount is outside the supported range.",
    );
  }

  const scale = 10n ** BigInt(fractionDigits);
  const value = BigInt(amount);
  const whole = value / scale;
  const fractional = value % scale;
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const numberFormatter = new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  });
  const fractionalFormatter = new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 0,
  });
  const wholeText = numberFormatter.format(whole);
  const fractionalText = fractionalFormatter
    .format(fractional)
    .padStart(fractionDigits, "0");

  let insertedInteger = false;
  return currencyFormatter
    .formatToParts(0)
    .map((part) => {
      if (part.type === "integer") {
        if (insertedInteger) return "";
        insertedInteger = true;
        return wholeText;
      }
      if (part.type === "fraction") return fractionalText;
      return part.value;
    })
    .join("");
}

export function parseQuantityToScaledInteger(
  input: string,
  precision: number,
): number {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) {
    throw new AppError(
      "VALIDATION",
      "Unit precision must be between zero and six.",
    );
  }
  const value = input.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new AppError(
      "VALIDATION",
      "Enter a non-negative quantity using digits and a decimal point.",
      "quantity",
    );
  }
  const fraction = match[2] ?? "";
  if (fraction.length > precision) {
    throw new AppError(
      "VALIDATION",
      `This unit allows at most ${precision} decimal places.`,
      "quantity",
    );
  }
  const scale = 10n ** BigInt(precision);
  const scaled =
    BigInt(match[1] ?? "0") * scale +
    BigInt(fraction.padEnd(precision, "0") || "0");
  if (scaled > MAX_MINOR_UNITS) {
    throw new AppError("VALIDATION", "The quantity is too large.", "quantity");
  }
  return Number(scaled);
}

export function formatScaledQuantity(value: number, precision: number): string {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    precision < 0 ||
    precision > 6
  ) {
    throw new AppError(
      "VALIDATION",
      "Stored quantity is outside the supported range.",
    );
  }
  const scale = 10n ** BigInt(precision);
  const amount = BigInt(value);
  const whole = amount / scale;
  if (precision === 0) return whole.toString();
  const fraction = (amount % scale)
    .toString()
    .padStart(precision, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
