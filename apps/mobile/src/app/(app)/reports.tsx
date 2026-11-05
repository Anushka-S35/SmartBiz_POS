import React, { useCallback, useEffect, useState } from "react";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import {
  AppError,
  formatMinorUnits,
  hasPermission,
  localeTag,
  safeCsvValue,
  type InventoryValuation,
  type PurchaseReport,
  type SalesReport,
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

type ReportMode = "SALES" | "PURCHASES" | "VALUATION";

function localBoundary(day: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error("Enter dates in YYYY-MM-DD format.");
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - represented;
  }
  return new Date(guess).toISOString();
}
function nextDay(day: string): string {
  const value = new Date(day + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
function htmlEscape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

export default function ReportsScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [currency, setCurrency] = useState({
    currencyCode: "INR",
    currencyFractionDigits: 2,
  });
  const [mode, setMode] = useState<ReportMode>("SALES");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [purchases, setPurchases] = useState<PurchaseReport | null>(null);
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const canRead = Boolean(
    user &&
    hasPermission(
      user.role,
      mode === "PURCHASES"
        ? "purchasing.read"
        : mode === "VALUATION"
          ? "inventory.read"
          : "billing.read",
    ),
  );

  const load = useCallback(async () => {
    if (!app || !user || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const [business, money] = await Promise.all([
        app.getBusiness(user.id),
        app.getBillingCurrency(user.id),
      ]);
      setTimezone(business.timezone);
      setCurrency(money);
      if (mode === "SALES") {
        setSales(
          await app.getSalesReport(user.id, {
            from: localBoundary(from, business.timezone),
            to: localBoundary(nextDay(to), business.timezone),
            groupBy,
          }),
        );
      } else if (mode === "PURCHASES") {
        setPurchases(
          await app.getPurchaseReport(user.id, {
            from: localBoundary(from, business.timezone),
            to: localBoundary(nextDay(to), business.timezone),
            groupBy,
          }),
        );
      } else setValuation(await app.getInventoryValuation(user.id));
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [app, user, canRead, from, to, mode, groupBy]);
  useEffect(() => {
    void load();
  }, [load]);
  const amount = (value: number) =>
    formatMinorUnits(
      value,
      currency.currencyCode,
      localeTag(locale),
      currency.currencyFractionDigits,
    );

  const exportCsv = async () => {
    if (!app) return;
    try {
      let contents = "",
        filename = "";
      if (mode === "SALES" && sales) {
        contents = app.exportSalesReportCsv(sales);
        filename = "smartbiz-sales-report.csv";
      } else if (mode === "PURCHASES" && purchases) {
        contents = app.exportPurchaseReportCsv(purchases);
        filename = "smartbiz-purchase-report.csv";
      } else if (mode === "VALUATION" && valuation) {
        const quote = (value: string | number) =>
          '"' + String(safeCsvValue(value)).replaceAll('"', '""') + '"';
        contents = [
          "product,unit,on_hand_scaled,known_value_minor,unknown_quantity_scaled",
          ...valuation.products.map((row) =>
            [
              row.productName,
              row.unitName,
              row.onHandScaled,
              row.knownValueMinor,
              row.unknownQuantityScaled,
            ]
              .map(quote)
              .join(","),
          ),
        ].join("\n");
        filename = "smartbiz-inventory-valuation.csv";
      } else return;
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([contents], { type: "text/csv;charset=utf-8" }),
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, filename);
        file.create({ overwrite: true });
        file.write(contents);
        if (!(await Sharing.isAvailableAsync()))
          throw new AppError(
            "PERSISTENCE",
            "File sharing is unavailable on this device.",
          );
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/csv",
          dialogTitle: "Export report",
        });
      }
    } catch (caught) {
      setError(caught);
    }
  };

  const exportPdf = async () => {
    const title =
      mode === "SALES"
        ? "Sales report"
        : mode === "PURCHASES"
          ? "Purchase report"
          : "Inventory valuation";
    let rows: string[] = [];
    if (mode === "SALES" && sales)
      rows = [
        "<p>Net sales: " + amount(sales.netSalesMinor) + "</p>",
        "<p>Returns: " + amount(sales.returnedMinor) + "</p>",
        "<p>Net payments: " + amount(sales.netPaymentsMinor) + "</p>",
        "<p>Outstanding: " + amount(sales.outstandingMinor) + "</p>",
        "<p>Gross profit: " +
          (sales.grossProfitMinor === null
            ? "Unavailable (unknown historical cost)"
            : amount(sales.grossProfitMinor)) +
          "</p>",
        ...sales.groups.map(
          (g) =>
            "<p>" +
            htmlEscape(g.period) +
            " · sales " +
            amount(g.netSalesMinor) +
            " · invoices " +
            g.invoiceCount +
            "</p>",
        ),
      ];
    else if (mode === "PURCHASES" && purchases)
      rows = [
        "<p>Purchases: " + amount(purchases.purchasesMinor) + "</p>",
        "<p>Credits: " + amount(purchases.creditsMinor) + "</p>",
        "<p>Net purchases: " + amount(purchases.netPurchasesMinor) + "</p>",
        "<p>Payments: " + amount(purchases.paymentsMinor) + "</p>",
        ...purchases.groups.map(
          (g) =>
            "<p>" +
            htmlEscape(g.period) +
            " · net purchases " +
            amount(g.netPurchasesMinor) +
            "</p>",
        ),
      ];
    else if (mode === "VALUATION" && valuation)
      rows = [
        "<p>Method: FIFO</p>",
        "<p>Known value: " + amount(valuation.knownValueMinor) + "</p>",
        "<p>Unknown quantity: " + valuation.unknownQuantityScaled + "</p>",
        ...valuation.products.map(
          (row) =>
            "<p>" +
            htmlEscape(row.productName) +
            " · " +
            amount(row.knownValueMinor) +
            " known · " +
            row.unknownQuantityScaled +
            " unknown " +
            htmlEscape(row.unitName) +
            "</p>",
        ),
      ];
    else return;
    const html =
      '<html><head><meta charset="utf-8"><style>body{font:14px sans-serif;color:#252C33;margin:32px}h1{font-size:22px;color:#263747}p{border-bottom:1px solid #E1E5E5;padding:8px 0}</style></head><body><h1>' +
      title +
      "</h1><p>" +
      htmlEscape(from) +
      " — " +
      htmlEscape(to) +
      " (" +
      htmlEscape(timezone) +
      ")</p>" +
      rows.join("") +
      "</body></html>";
    try {
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return;
      }
      const result = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync()))
        throw new AppError(
          "PERSISTENCE",
          "PDF sharing is unavailable on this device.",
        );
      await Sharing.shareAsync(result.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Export PDF report",
      });
    } catch (caught) {
      setError(caught);
    }
  };

  return (
    <Page>
      <Heading subtitle={"Dates use " + timezone}>Business reports</Heading>
      {error ? <ErrorBanner>{errorText(error)}</ErrorBanner> : null}
      <Card>
        <Choice
          selected={mode}
          onSelect={(value) => setMode(value as ReportMode)}
          options={[
            { value: "SALES", label: "Sales" },
            { value: "PURCHASES", label: "Purchases" },
            { value: "VALUATION", label: "Inventory value" },
          ]}
        />
        {mode !== "VALUATION" ? (
          <>
            <Field
              label="From date (YYYY-MM-DD)"
              value={from}
              onChangeText={setFrom}
            />
            <Field
              label="To date (YYYY-MM-DD)"
              value={to}
              onChangeText={setTo}
            />
            <Choice
              selected={groupBy}
              onSelect={(value) => setGroupBy(value as typeof groupBy)}
              options={[
                { value: "day", label: "Group by day" },
                { value: "week", label: "Group by week" },
                { value: "month", label: "Group by month" },
              ]}
            />
          </>
        ) : null}
        <Button onPress={() => void load()} disabled={loading}>
          Run report
        </Button>
        <Button secondary onPress={() => void exportCsv()} disabled={loading}>
          Export CSV
        </Button>
        <Button secondary onPress={() => void exportPdf()} disabled={loading}>
          Export PDF / print
        </Button>
      </Card>
      {mode === "SALES" && sales ? (
        <>
          <Card>
            <Heading>Sales summary</Heading>
            <Body>
              Posted invoices: {sales.invoiceCount} · Cancelled:{" "}
              {sales.cancelledInvoiceCount}
            </Body>
            <Body>
              Gross sales: {amount(sales.grossSalesMinor)} · Returns:{" "}
              {amount(sales.returnedMinor)}
            </Body>
            <Body>
              Net sales: {amount(sales.netSalesMinor)} · Net subtotal:{" "}
              {amount(sales.netSubtotalMinor)}
            </Body>
            <Body>
              Payments/refunds: {amount(sales.netPaymentsMinor)} · Outstanding:{" "}
              {amount(sales.outstandingMinor)}
            </Body>
            <Body>Cost of goods: {amount(sales.costOfGoodsMinor)}</Body>
            <Body>
              {sales.grossProfitMinor === null
                ? "Gross profit unavailable: " +
                  sales.unknownCostLineCount +
                  " sale lines contain unknown FIFO cost."
                : "Gross profit: " + amount(sales.grossProfitMinor)}
            </Body>
          </Card>
          <Card>
            <Heading>{groupBy} groups</Heading>
            {sales.groups.map((row) => (
              <Body key={row.period}>
                {row.period} · {row.invoiceCount} invoices · sales{" "}
                {amount(row.netSalesMinor)} · payments{" "}
                {amount(row.netPaymentsMinor)} · due{" "}
                {amount(row.outstandingMinor)}
              </Body>
            ))}
          </Card>
          <Card>
            <Heading>Products</Heading>
            {sales.products.map((row) => (
              <Body key={row.productId}>
                {row.productName} · {row.sku} · {row.categoryName} ·{" "}
                {amount(row.netSalesMinor)}
              </Body>
            ))}
          </Card>
          <Card>
            <Heading>Categories</Heading>
            {sales.categories.map((row) => (
              <Body key={row.categoryName}>
                {row.categoryName} · {amount(row.netSalesMinor)}
              </Body>
            ))}
          </Card>
        </>
      ) : null}
      {mode === "PURCHASES" && purchases ? (
        <>
          <Card>
            <Heading>Purchase totals</Heading>
            <Body>
              {purchases.purchaseCount} receipts · Purchases{" "}
              {amount(purchases.purchasesMinor)} · Credits{" "}
              {amount(purchases.creditsMinor)} · Net purchases{" "}
              {amount(purchases.netPurchasesMinor)} · Payments{" "}
              {amount(purchases.paymentsMinor)}
            </Body>
          </Card>
          <Card>
            <Heading>{groupBy} groups</Heading>
            {purchases.groups.map((row) => (
              <Body key={row.period}>
                {row.period} · {row.purchaseCount} receipts · purchases{" "}
                {amount(row.purchasesMinor)} · credits{" "}
                {amount(row.creditsMinor)} · net {amount(row.netPurchasesMinor)}{" "}
                · paid {amount(row.paymentsMinor)}
              </Body>
            ))}
          </Card>
          <Card>
            <Heading>Supplier balances</Heading>
            {purchases.suppliers.map((row) => (
              <Body key={row.supplierId}>
                {row.supplierName} · current outstanding{" "}
                {amount(row.outstandingMinor)}
              </Body>
            ))}
          </Card>
        </>
      ) : null}
      {mode === "VALUATION" && valuation ? (
        <>
          <Card>
            <Heading>Inventory valuation · FIFO</Heading>
            <Body>Known cost value {amount(valuation.knownValueMinor)}</Body>
            <Body>
              Unknown-cost quantity {valuation.unknownQuantityScaled} (in each
              product’s stored unit scale)
            </Body>
          </Card>
          <Card>
            <Heading>Product values</Heading>
            {valuation.products.map((row) => (
              <Body key={row.productId}>
                {row.productName} · {row.onHandScaled} {row.unitName} ·{" "}
                {amount(row.knownValueMinor)} known ·{" "}
                {row.unknownQuantityScaled} unknown
              </Body>
            ))}
          </Card>
        </>
      ) : null}
    </Page>
  );
}
