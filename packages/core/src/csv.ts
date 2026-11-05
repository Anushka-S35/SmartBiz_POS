function startsFormula(value: string, start = 0): boolean {
  let index = start;
  while (index < value.length) {
    const character = value[index] ?? "";
    const code = value.charCodeAt(index);
    if (
      /\s/u.test(character) ||
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f)
    ) {
      index += 1;
      continue;
    }
    return "=+-@".includes(character);
  }
  return false;
}

/** Prefix spreadsheet formulas in CSV text fields without changing numeric cells. */
export function safeCsvValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (
    startsFormula(value) ||
    (value.startsWith("'") && startsFormula(value, 1))
  ) {
    return `'${value}`;
  }
  return value;
}

/** Escape a formula guard on product-import round trips. */
export function restoreCsvValue(value: string): string {
  if (value.startsWith("''") && startsFormula(value, 2)) return value.slice(1);
  if (value.startsWith("'") && startsFormula(value, 1)) {
    return value.slice(1);
  }
  return value;
}

export function safeCsvRows<T extends Record<string, string | number | null>>(
  rows: readonly T[],
): T[] {
  return rows.map(
    (row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, safeCsvValue(value)]),
      ) as T,
  );
}
