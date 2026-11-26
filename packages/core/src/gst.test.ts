import { describe, expect, it } from "vitest";
import {
  calculateGstLine,
  hasValidGstinStructure,
  hasValidHsnSacStructure,
} from "./gst";

describe("GST calculation primitives", () => {
  it("splits intra-state GST into CGST and SGST and reconciles total", () => {
    const line = calculateGstLine({
      amountMinor: 10000,
      supplyType: "TAXABLE",
      pricingMode: "EXCLUSIVE",
      gstRateBasisPoints: 1800,
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
    });
    expect(line).toMatchObject({
      taxableValueMinor: 10000,
      cgstMinor: 900,
      sgstMinor: 900,
      igstMinor: 0,
      totalTaxMinor: 1800,
      totalMinor: 11800,
    });
  });

  it("uses IGST for an explicitly supplied inter-state place of supply", () => {
    const line = calculateGstLine({
      amountMinor: 10000,
      supplyType: "TAXABLE",
      pricingMode: "EXCLUSIVE",
      gstRateBasisPoints: 500,
      supplierStateCode: "27",
      placeOfSupplyStateCode: "29",
    });
    expect(line).toMatchObject({
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 500,
      totalMinor: 10500,
    });
  });

  it("removes tax from inclusive prices and applies discounts before tax", () => {
    const line = calculateGstLine({
      amountMinor: 11800,
      discountMinor: 1800,
      supplyType: "TAXABLE",
      pricingMode: "INCLUSIVE",
      gstRateBasisPoints: 1800,
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
    });
    expect(line).toMatchObject({
      taxableValueMinor: 8475,
      discountMinor: 1800,
      totalMinor: 10000,
    });
    expect(line.cgstMinor + line.sgstMinor + line.cessMinor).toBe(
      line.totalTaxMinor,
    );
    expect(line.taxableValueMinor + line.totalTaxMinor).toBe(line.totalMinor);
  });

  it("keeps exempt and nil-rated amounts free of tax", () => {
    for (const supplyType of ["EXEMPT", "NIL_RATED"] as const) {
      const line = calculateGstLine({
        amountMinor: 12345,
        supplyType,
        pricingMode: "EXCLUSIVE",
        gstRateBasisPoints: 0,
        supplierStateCode: "27",
        placeOfSupplyStateCode: "27",
      });
      expect(line).toMatchObject({
        taxableValueMinor: 12345,
        totalTaxMinor: 0,
        totalMinor: 12345,
      });
    }
  });

  it("requires explicit state codes and rejects non-GST lines carrying GST rates", () => {
    expect(() =>
      calculateGstLine({
        amountMinor: 100,
        supplyType: "TAXABLE",
        pricingMode: "EXCLUSIVE",
        gstRateBasisPoints: 500,
        supplierStateCode: "",
        placeOfSupplyStateCode: "27",
      }),
    ).toThrow();
    expect(() =>
      calculateGstLine({
        amountMinor: 100,
        supplyType: "NON_GST",
        pricingMode: "EXCLUSIVE",
        gstRateBasisPoints: 500,
        supplierStateCode: "27",
        placeOfSupplyStateCode: "27",
      }),
    ).toThrow();
  });

  it("checks GSTIN structure and HSN/SAC field length without claiming portal verification", () => {
    expect(hasValidGstinStructure("27AAPFU0939F1ZV")).toBe(true);
    expect(hasValidGstinStructure("27AAPFU0939F1Z1")).toBe(false);
    expect(hasValidHsnSacStructure("09012100")).toBe(true);
    expect(hasValidHsnSacStructure("12345")).toBe(false);
  });
});
