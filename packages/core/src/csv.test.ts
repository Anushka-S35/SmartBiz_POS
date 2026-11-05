import { describe, expect, it } from "vitest";
import { restoreCsvValue, safeCsvRows, safeCsvValue } from "./csv";

describe("spreadsheet-safe CSV fields", () => {
  it.each([
    "=1+1",
    "+SUM(A1:A2)",
    "-cmd",
    "@SUM(A1)",
    " \t=2+2",
    "\r\n+1",
    "\u0000@x",
  ])(
    "prefixes a formula marker after leading whitespace/control characters: %j",
    (value) => {
      expect(safeCsvValue(value)).toBe(`'${value}`);
    },
  );

  it("preserves ordinary values and non-text numeric cells", () => {
    expect(safeCsvValue("Regular product")).toBe("Regular product");
    expect(safeCsvValue(-125)).toBe(-125);
    expect(safeCsvRows([{ name: "=2+2", price: 250 }])).toEqual([
      { name: "'=2+2", price: 250 },
    ]);
  });

  it("round trips guarded formula text and ambiguous literal apostrophes", () => {
    for (const value of ["=SUM(A1)", " \t@SUM(A1)", "'=literal text"]) {
      expect(restoreCsvValue(String(safeCsvValue(value)))).toBe(value);
    }
  });
});
