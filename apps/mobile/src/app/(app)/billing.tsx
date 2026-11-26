import React, { useCallback, useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import {
  formatMinorUnits,
  formatScaledQuantity,
  hasPermission,
  localeTag,
  minorUnitsToDecimal,
  translate,
  type CustomerRecord,
  type InvoiceRecord,
  type PaymentMethod,
  type ProductRecord,
  type TaxRateRecord,
} from "@smartbiz/core";
import {
  Body,
  Button,
  Card,
  Choice,
  ErrorBanner,
  Field,
  Heading,
  Page,
} from "../../components/ui";
import { useApp } from "../../context/app-context";

type CartLine = { product: ProductRecord; quantity: string; discount: string };
type ReturnDisposition = "RESTOCK" | "DAMAGED" | "QUARANTINE";
type CollectiblePaymentMethod = Exclude<PaymentMethod, "REFUND">;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function amountInIndianWords(amountMinor: number): string {
  const ones = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  ];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const underThousand = (value: number): string => {
    const words: string[] = [];
    if (value >= 100) {
      words.push(`${ones[Math.floor(value / 100)]} hundred`);
      value %= 100;
    }
    if (value >= 20) {
      words.push(tens[Math.floor(value / 10)] ?? "");
      value %= 10;
    }
    if (value > 0) words.push(ones[value] ?? "");
    return words.filter(Boolean).join(" ");
  };
  let value = BigInt(amountMinor);
  const paise = Number(value % 100n);
  value /= 100n;
  const groups: Array<[bigint, string]> = [
    [10_000_000n, "crore"],
    [100_000n, "lakh"],
    [1_000n, "thousand"],
  ];
  const words: string[] = [];
  for (const [size, label] of groups) {
    const group = value / size;
    if (group > 0n) {
      words.push(`${underThousand(Number(group))} ${label}`);
      value %= size;
    }
  }
  if (value >= 100n) {
    words.push(`${ones[Number(value / 100n)]} hundred`);
    value %= 100n;
  }
  if (value > 0n || words.length === 0) words.push(underThousand(Number(value)));
  const paiseWords = paise ? ` and ${underThousand(paise)} paise` : "";
  return `Rupees ${words.join(" ")}${paiseWords} only`.replaceAll("  ", " ");
}

export default function BillingScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [business, setBusiness] = useState<{
    currencyCode: string;
    currencyFractionDigits: number;
    taxEnabled: boolean;
    businessName: string;
    businessAddress: string;
    businessPhone: string;
    gstRegistrationType: "NOT_CONFIGURED" | "REGULAR" | "COMPOSITION" | "UNREGISTERED";
    gstin: string;
    gstTradeName: string;
    gstRegisteredAddress: string;
    gstStateCode: string;
    gstInvoiceFooter: string;
    gstInvoicePrefix: string;
    gstFinancialYearStartMonth: number;
  } | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(
    null,
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<CollectiblePaymentMethod>("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [returnLineId, setReturnLineId] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRefund, setReturnRefund] = useState("0");
  const [returnReason, setReturnReason] = useState("");
  const [returnDisposition, setReturnDisposition] =
    useState<ReturnDisposition>("RESTOCK");
  const [cancellationReason, setCancellationReason] = useState("");
  const [taxCategoryCode, setTaxCategoryCode] = useState("");
  const [taxRateBasisPoints, setTaxRateBasisPoints] = useState("");
  const [taxCessRateBasisPoints, setTaxCessRateBasisPoints] = useState("0");
  const [taxRateEffectiveAt, setTaxRateEffectiveAt] = useState(() =>
    new Date().toISOString(),
  );
  const [taxRateSourceReference, setTaxRateSourceReference] = useState("");
  const [taxRateReason, setTaxRateReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [working, setWorking] = useState(false);
  const [draftRequestKey, setDraftRequestKey] = useState(() =>
    Crypto.randomUUID(),
  );
  const [paymentRequestKey, setPaymentRequestKey] = useState(() =>
    Crypto.randomUUID(),
  );
  const [returnRequestKey, setReturnRequestKey] = useState(() =>
    Crypto.randomUUID(),
  );
  const canManageTax = Boolean(user && hasPermission(user.role, "tax.manage"));

  const refresh = useCallback(async () => {
    if (!app || !user) return;
    try {
      const [productRows, customerRows, invoiceRows, profile, rateRows] =
        await Promise.all([
          app.listProducts(user.id, { search: productSearch, limit: 30 }),
          app.listCustomers(user.id, customerSearch),
          app.listInvoices(user.id, invoiceSearch),
          app.getBillingCurrency(user.id),
          canManageTax ? app.listTaxRates(user.id) : Promise.resolve([]),
        ]);
      setProducts(productRows);
      setCustomers(customerRows);
      setInvoices(invoiceRows);
      setBusiness(profile);
      setTaxRates(rateRows);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user, productSearch, customerSearch, invoiceSearch, canManageTax]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 180);
    return () => clearTimeout(timer);
  }, [refresh]);

  const currency = business?.currencyCode ?? "INR";
  const fractionDigits = business?.currencyFractionDigits ?? 2;
  const money = (minor: number) =>
    formatMinorUnits(minor, currency, localeTag(locale), fractionDigits);

  const addProduct = (product: ProductRecord) => {
    setCart((current) => {
      const found = current.find((line) => line.product.id === product.id);
      if (found) return current;
      return [...current, { product, quantity: "1", discount: "0" }];
    });
  };

  const createDraft = async () => {
    if (!app || !user || cart.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      const draft = await app.createInvoiceDraft(user.id, {
        customerId: customerId || null,
        placeOfSupplyStateCode,
        idempotencyKey: draftRequestKey,
        lines: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          discount: line.discount,
        })),
      });
      setSelectedInvoice(draft);
      setCart([]);
      setDraftRequestKey(Crypto.randomUUID());
      setReturnLineId(draft.lines[0]?.id ?? "");
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };

  const openInvoice = async (invoiceId: string) => {
    if (!app || !user) return;
    try {
      const invoice = await app.getInvoice(user.id, invoiceId);
      setSelectedInvoice(invoice);
      setReturnLineId(invoice.lines[0]?.id ?? "");
      setPaymentAmount(minorUnitsToDecimal(invoice.dueMinor, fractionDigits));
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  };

  const postInvoice = async () => {
    if (!app || !user || !selectedInvoice) return;
    setWorking(true);
    setError(null);
    try {
      const posted = await app.postInvoice(user.id, selectedInvoice.id);
      setSelectedInvoice(posted);
      setPaymentAmount(minorUnitsToDecimal(posted.dueMinor, fractionDigits));
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };

  const recordPayment = async () => {
    if (!app || !user || !selectedInvoice) return;
    setWorking(true);
    setError(null);
    try {
      const updated = await app.addInvoicePayment(user.id, selectedInvoice.id, {
        method: paymentMethod,
        amount: paymentAmount,
        reference: paymentReference,
        idempotencyKey: paymentRequestKey,
      });
      setSelectedInvoice(updated);
      setPaymentAmount(minorUnitsToDecimal(updated.dueMinor, fractionDigits));
      setPaymentRequestKey(Crypto.randomUUID());
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };

  const processReturn = async () => {
    if (!app || !user || !selectedInvoice) return;
    setWorking(true);
    setError(null);
    try {
      setSelectedInvoice(
        await app.returnInvoice(user.id, selectedInvoice.id, {
          reason: returnReason,
          idempotencyKey: returnRequestKey,
          refund: returnRefund,
          lines: [
            {
              invoiceLineId: returnLineId,
              quantity: returnQuantity,
              disposition: returnDisposition,
            },
          ],
        }),
      );
      setReturnRequestKey(Crypto.randomUUID());
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };

  const cancelInvoice = async () => {
    if (!app || !user || !selectedInvoice) return;
    setWorking(true);
    setError(null);
    try {
      setSelectedInvoice(
        await app.cancelInvoice(
          user.id,
          selectedInvoice.id,
          cancellationReason,
        ),
      );
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };

  const printOrShareInvoice = async () => {
    if (!selectedInvoice || !business) return;
    setWorking(true);
    setError(null);
    try {
      const documentLabel = t(
        selectedInvoice.documentType === "TAX_INVOICE"
          ? "gstDocumentTaxInvoice"
          : selectedInvoice.documentType === "BILL_OF_SUPPLY"
            ? "gstDocumentBillOfSupply"
            : selectedInvoice.documentType === "INVOICE_CUM_BILL_OF_SUPPLY"
              ? "gstDocumentInvoiceCumBill"
              : "gstDocumentReceipt",
      );
      const cgstMinor = selectedInvoice.lines.reduce(
        (sum, line) => sum + line.cgstMinor,
        0,
      );
      const sgstMinor = selectedInvoice.lines.reduce(
        (sum, line) => sum + line.sgstMinor,
        0,
      );
      const igstMinor = selectedInvoice.lines.reduce(
        (sum, line) => sum + line.igstMinor,
        0,
      );
      const cessMinor = selectedInvoice.lines.reduce(
        (sum, line) => sum + line.cessMinor,
        0,
      );
      const taxableMinor = selectedInvoice.lines.reduce(
        (sum, line) => sum + line.taxableValueMinor,
        0,
      );
      const amountWords =
        currency === "INR"
          ? `<p><span>${escapeHtml(t("gstAmountWords"))}</span>: ${escapeHtml(amountInIndianWords(selectedInvoice.totalMinor))}</p>`
          : "";
      const invoiceDate = selectedInvoice.postedAt ?? selectedInvoice.createdAt;
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;color:#252C33;margin:32px}
        h1{font-size:22px;margin-bottom:4px}p{margin:4px 0}
        table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}
        th,td{border:1px solid #C9D1D1;padding:7px;text-align:left;vertical-align:top}
        .right{text-align:right}.totals{margin:20px 0 0 auto;width:300px}
        .totals p{display:flex;justify-content:space-between}.muted{color:#58636A;font-size:12px}
        </style></head><body>
        <h1>${escapeHtml(selectedInvoice.supplierLegalNameSnapshot || business.businessName)}</h1>
        ${selectedInvoice.supplierTradeNameSnapshot ? `<p>${escapeHtml(selectedInvoice.supplierTradeNameSnapshot)}</p>` : ""}
        <p>${escapeHtml(selectedInvoice.supplierAddressSnapshot || business.businessAddress)}</p>
        ${selectedInvoice.supplierGstinSnapshot ? `<p>GSTIN: ${escapeHtml(selectedInvoice.supplierGstinSnapshot)}</p>` : ""}
        <h2>${escapeHtml(documentLabel)}</h2>
        <p>Invoice no.: ${escapeHtml(selectedInvoice.invoiceNumber)} · ${escapeHtml(t("gstInvoiceDate"))}: ${escapeHtml(invoiceDate.slice(0, 10))}</p>
        <p>${escapeHtml(t("gstCustomer"))}: ${escapeHtml(selectedInvoice.customerName)}</p>
        ${selectedInvoice.customerAddressSnapshot ? `<p>${escapeHtml(selectedInvoice.customerAddressSnapshot)}</p>` : ""}
        ${selectedInvoice.customerGstinSnapshot ? `<p>GSTIN: ${escapeHtml(selectedInvoice.customerGstinSnapshot)}</p>` : ""}
        ${selectedInvoice.placeOfSupplyStateCode ? `<p>${escapeHtml(t("gstPlaceOfSupplyShort"))}: ${escapeHtml(selectedInvoice.placeOfSupplyStateCode)}</p>` : ""}
        ${selectedInvoice.documentType !== "RETAIL_RECEIPT" ? `<p>${escapeHtml(t("gstReverseCharge"))}: ${selectedInvoice.reverseCharge ? "Yes" : "No"}</p>` : ""}
        <table><thead><tr>
          <th>Item</th><th>${escapeHtml(t("gstHsnColumn"))}</th><th>Qty / unit</th>
          <th>${escapeHtml(t("gstTaxableValue"))}</th><th>Discount</th><th>${escapeHtml(t("gstCgst"))}</th>
          <th>${escapeHtml(t("gstSgst"))}</th><th>${escapeHtml(t("gstIgst"))}</th><th>${escapeHtml(t("gstCess"))}</th>
          <th class="right">Total</th></tr></thead><tbody>${selectedInvoice.lines
            .map(
              (line) => `<tr>
            <td>${escapeHtml(line.productName)}<br><span class="muted">${escapeHtml(line.sku)} · ${line.taxRateBasisPoints / 100}%</span></td>
            <td>${escapeHtml(line.hsnSacCode)}</td>
            <td>${escapeHtml(formatScaledQuantity(line.quantityScaled, line.unitPrecision))} ${escapeHtml(line.unitName)}</td>
            <td>${escapeHtml(money(line.taxableValueMinor))}</td>
            <td>${escapeHtml(money(line.discountMinor))}</td>
            <td>${escapeHtml(money(line.cgstMinor))}</td>
            <td>${escapeHtml(money(line.sgstMinor))}</td>
            <td>${escapeHtml(money(line.igstMinor))}</td>
            <td>${escapeHtml(money(line.cessMinor))}</td>
            <td class="right">${escapeHtml(money(line.totalMinor))}</td></tr>`,
            )
            .join("")}</tbody></table>
        <div class="totals">
          <p><span>Subtotal</span><strong>${escapeHtml(money(selectedInvoice.subtotalMinor))}</strong></p>
          <p><span>Discount</span><strong>${escapeHtml(money(selectedInvoice.discountMinor))}</strong></p>
          <p><span>${escapeHtml(t("gstTaxableValue"))}</span><strong>${escapeHtml(money(taxableMinor))}</strong></p>
          <p><span>${escapeHtml(t("gstCgst"))}</span><strong>${escapeHtml(money(cgstMinor))}</strong></p>
          <p><span>${escapeHtml(t("gstSgst"))}</span><strong>${escapeHtml(money(sgstMinor))}</strong></p>
          <p><span>${escapeHtml(t("gstIgst"))}</span><strong>${escapeHtml(money(igstMinor))}</strong></p>
          <p><span>${escapeHtml(t("gstCess"))}</span><strong>${escapeHtml(money(cessMinor))}</strong></p>
          <p><span>${escapeHtml(t("gstTotalTax"))}</span><strong>${escapeHtml(money(selectedInvoice.taxMinor))}</strong></p>
          <p><span>Total</span><strong>${escapeHtml(money(selectedInvoice.totalMinor))}</strong></p>
          <p><span>Paid</span><strong>${escapeHtml(money(selectedInvoice.paidMinor))}</strong></p>
          <p><span>Due</span><strong>${escapeHtml(money(selectedInvoice.dueMinor))}</strong></p>
        </div>${amountWords}
        ${business.gstInvoiceFooter ? `<p class="muted">${escapeHtml(business.gstInvoiceFooter)}</p>` : ""}
        </body></html>`;
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const file = await Print.printToFileAsync({ html });
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error("PDF sharing is unavailable on this device.");
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: selectedInvoice.invoiceNumber,
        });
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };

  const canCancel = Boolean(user && hasPermission(user.role, "billing.cancel"));
  const saveTaxRate = async () => {
    if (!app || !user) return;
    setWorking(true);
    setError(null);
    try {
      await app.setTaxRate(user.id, {
        categoryCode: taxCategoryCode,
        rateBasisPoints: Number(taxRateBasisPoints),
        cessRateBasisPoints: Number(taxCessRateBasisPoints),
        effectiveAt: taxRateEffectiveAt,
        sourceReference: taxRateSourceReference,
        reason: taxRateReason,
      });
      setTaxRateReason("");
      setTaxRateBasisPoints("");
      setTaxCessRateBasisPoints("0");
      setTaxRateSourceReference("");
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(false);
    }
  };
  return (
    <Page>
      <Heading subtitle="Create invoices, take payment, and review sales">
        Billing
      </Heading>
      {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
      {canManageTax && business?.taxEnabled ? (
        <Card>
          <Heading>{t("taxRates")}</Heading>
          <Body muted>
            Rates are entered as basis points and applied as tax-exclusive
            amounts. Confirm applicable rates and rules with your tax adviser;
            this is not a GST compliance determination.
          </Body>
          <Field
            label={t("taxRateCategory")}
            value={taxCategoryCode}
            onChangeText={setTaxCategoryCode}
          />
          <Field
            label={t("taxRateBasisPoints")}
            value={taxRateBasisPoints}
            onChangeText={setTaxRateBasisPoints}
            keyboardType="number-pad"
          />
          <Field
            label={t("taxRateCess")}
            value={taxCessRateBasisPoints}
            onChangeText={setTaxCessRateBasisPoints}
            keyboardType="number-pad"
          />
          <Field
            label={t("taxRateEffectiveAt")}
            value={taxRateEffectiveAt}
            onChangeText={setTaxRateEffectiveAt}
            autoCapitalize="none"
          />
          <Field
            label={t("taxRateSource")}
            value={taxRateSourceReference}
            onChangeText={setTaxRateSourceReference}
          />
          <Field
            label={t("taxRateReason")}
            value={taxRateReason}
            onChangeText={setTaxRateReason}
          />
          <Button
            secondary
            onPress={() => void saveTaxRate()}
            disabled={
              working ||
              !taxCategoryCode ||
              !taxRateBasisPoints ||
              !taxRateSourceReference ||
              !taxRateReason
            }
          >
            {t("saveTaxRate")}
          </Button>
          {taxRates.map((rate) => (
            <Body key={rate.id}>
              {rate.categoryCode} · {rate.rateBasisPoints / 100}% ·{" "}
              {t("taxRateCess")} {rate.cessRateBasisPoints / 100}% ·{" "}
              {rate.effectiveAt.slice(0, 10)} · {rate.sourceReference}
            </Body>
          ))}
        </Card>
      ) : null}
      <Card>
        <Heading>New sale</Heading>
        <Field
          label="Search products or scan/type a barcode"
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Product, SKU or barcode"
        />
        {products.map((product) => (
          <Button
            key={product.id}
            secondary
            onPress={() => addProduct(product)}
          >
            Add {product.name} · {money(product.sellingPriceMinor)}
          </Button>
        ))}
        <Field
          label="Find customer (leave blank for Walk-in)"
          value={customerSearch}
          onChangeText={setCustomerSearch}
          placeholder="Name, phone or email"
        />
        <Choice
          selected={customerId}
          onSelect={setCustomerId}
          options={[
            { value: "", label: "Walk-in" },
            ...customers.slice(0, 12).map((customer) => ({
              value: customer.id,
              label: customer.name,
            })),
          ]}
        />
        {business?.gstRegistrationType === "REGULAR" ||
        business?.gstRegistrationType === "COMPOSITION" ? (
          <>
            <Field
              label={t("gstPlaceOfSupply")}
              value={placeOfSupplyStateCode}
              onChangeText={(text) =>
                setPlaceOfSupplyStateCode(text.replace(/\D/g, "").slice(0, 2))
              }
              keyboardType="number-pad"
            />
            <Body muted>{t("gstPlaceOfSupplyHelp")}</Body>
          </>
        ) : null}
        <Heading>
          Cart · {cart.length} item{cart.length === 1 ? "" : "s"}
        </Heading>
        {cart.map((line) => (
          <Card key={line.product.id}>
            <Body>
              {line.product.name} · {money(line.product.sellingPriceMinor)} /{" "}
              {line.product.unitName}
            </Body>
            <Field
              label="Quantity"
              value={line.quantity}
              onChangeText={(quantity) =>
                setCart((items) =>
                  items.map((item) =>
                    item.product.id === line.product.id
                      ? { ...item, quantity }
                      : item,
                  ),
                )
              }
              keyboardType="decimal-pad"
            />
            <Field
              label={`Line discount (${currency})`}
              value={line.discount}
              onChangeText={(discount) =>
                setCart((items) =>
                  items.map((item) =>
                    item.product.id === line.product.id
                      ? { ...item, discount }
                      : item,
                  ),
                )
              }
              keyboardType="decimal-pad"
            />
            <Button
              danger
              onPress={() =>
                setCart((items) =>
                  items.filter((item) => item.product.id !== line.product.id),
                )
              }
            >
              Remove item
            </Button>
          </Card>
        ))}
        <Button
          onPress={() => void createDraft()}
          disabled={working || cart.length === 0}
        >
          {working ? "Working..." : "Create invoice draft"}
        </Button>
      </Card>
      {selectedInvoice ? (
        <Card>
          <Heading
            subtitle={`${selectedInvoice.status} · ${selectedInvoice.customerName}`}
          >
            {selectedInvoice.invoiceNumber}
          </Heading>
          {selectedInvoice.lines.map((line) => (
            <Body key={line.id}>
              {line.productName} ·{" "}
              {formatScaledQuantity(line.quantityScaled, line.unitPrecision)}{" "}
              {line.unitName} · {money(line.totalMinor)}
            </Body>
          ))}
          <Body>
            Subtotal {money(selectedInvoice.subtotalMinor)} · Discount{" "}
            {money(selectedInvoice.discountMinor)} · Tax{" "}
            {money(selectedInvoice.taxMinor)}
          </Body>
          <Body>
            Total {money(selectedInvoice.totalMinor)} · Paid{" "}
            {money(selectedInvoice.paidMinor)} · Due{" "}
            {money(selectedInvoice.dueMinor)}
          </Body>
          {selectedInvoice.status !== "DRAFT" ? (
            <Button
              secondary
              onPress={() => void printOrShareInvoice()}
              disabled={working}
            >
              Print or share invoice
            </Button>
          ) : null}
          {selectedInvoice.status === "DRAFT" ? (
            <Button onPress={() => void postInvoice()} disabled={working}>
              Post invoice and deduct stock
            </Button>
          ) : null}
          {selectedInvoice.status === "POSTED" &&
          selectedInvoice.dueMinor > 0 ? (
            <Card>
              <Heading>Record payment</Heading>
              <Choice
                selected={paymentMethod}
                onSelect={(value) =>
                  setPaymentMethod(value as CollectiblePaymentMethod)
                }
                options={[
                  { value: "CASH", label: "Cash" },
                  { value: "UPI", label: "UPI" },
                  { value: "CARD", label: "Card" },
                  { value: "BANK_TRANSFER", label: "Bank transfer" },
                  { value: "CREDIT", label: "Credit" },
                ]}
              />
              <Field
                label={`Amount (${currency})`}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                keyboardType="decimal-pad"
              />
              <Field
                label="Payment reference (optional)"
                value={paymentReference}
                onChangeText={setPaymentReference}
              />
              <Button
                onPress={() => void recordPayment()}
                disabled={working || !paymentAmount}
              >
                Record payment
              </Button>
            </Card>
          ) : null}
          {selectedInvoice.status === "POSTED" ? (
            <Card>
              <Heading>Process return</Heading>
              <Choice
                selected={returnLineId}
                onSelect={setReturnLineId}
                options={selectedInvoice.lines.map((line) => ({
                  value: line.id,
                  label: line.productName,
                }))}
              />
              <Field
                label="Return quantity"
                value={returnQuantity}
                onChangeText={setReturnQuantity}
                keyboardType="decimal-pad"
              />
              <Choice
                selected={returnDisposition}
                onSelect={(value) =>
                  setReturnDisposition(value as ReturnDisposition)
                }
                options={[
                  { value: "RESTOCK", label: "Restock" },
                  { value: "DAMAGED", label: "Damaged" },
                  { value: "QUARANTINE", label: "Quarantine" },
                ]}
              />
              <Field
                label={`Refund (${currency}, zero if none)`}
                value={returnRefund}
                onChangeText={setReturnRefund}
                keyboardType="decimal-pad"
              />
              <Field
                label="Return reason"
                value={returnReason}
                onChangeText={setReturnReason}
              />
              <Button
                secondary
                onPress={() => void processReturn()}
                disabled={working || !returnReason || !returnLineId}
              >
                Record return
              </Button>
            </Card>
          ) : null}
          {canCancel && selectedInvoice.status === "POSTED" ? (
            <Card>
              <Heading>Cancel sale</Heading>
              <Body muted>
                Cancellation reverses the full sale stock and refunds the
                recorded net payment. Use returns for fulfilled items.
              </Body>
              <Field
                label="Cancellation reason"
                value={cancellationReason}
                onChangeText={setCancellationReason}
              />
              <Button
                danger
                onPress={() => void cancelInvoice()}
                disabled={working || !cancellationReason}
              >
                Cancel and reverse invoice
              </Button>
            </Card>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <Heading>Invoice history</Heading>
        <Field
          label="Search invoices"
          value={invoiceSearch}
          onChangeText={setInvoiceSearch}
          placeholder="Invoice number or customer"
        />
        {invoices.map((invoice) => (
          <Button
            key={invoice.id}
            secondary
            onPress={() => void openInvoice(invoice.id)}
          >
            {invoice.invoiceNumber} · {invoice.customerName} ·{" "}
            {money(invoice.totalMinor)} · {invoice.status}
          </Button>
        ))}
      </Card>
    </Page>
  );
}
