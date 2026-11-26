import React, { useCallback, useEffect, useRef, useState } from "react";
import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AppError,
  formatMinorUnits,
  hasPermission,
  localeTag,
  safeCsvValue,
  formatScaledQuantity,
  translate,
  type InventoryValuation,
  type PurchaseReport,
  type SalesReport,
  type StockBalanceRecord,
} from "@smartbiz/core";
import {
  Body,
  Button,
  Card,
  Choice,
  ErrorBanner,
  Heading,
  Page,
} from "../../components/ui";
import { useApp } from "../../context/app-context";
import { colors, radii, spacing } from "../../theme";

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
function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const value = new Date(`${day}T00:00:00.000Z`);
  return (
    !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === day
  );
}
function dayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year ?? "0000"}-${values.month ?? "00"}-${values.day ?? "00"}`;
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

const reportStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  headerCopy: { flex: 1, minWidth: 220 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  dateField: { flex: 1, minWidth: 180, gap: spacing.xs },
  nativeDateInput: {
    minHeight: 46,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  nativeDateText: { color: colors.ink, fontSize: 16 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  calendar: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    backgroundColor: colors.chip,
  },
  monthArrow: { color: colors.deepNavy, fontSize: 26, lineHeight: 30 },
  monthTitle: { color: colors.deepNavy, fontSize: 17, fontWeight: "700" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: {
    width: "14.2857%",
    minHeight: 36,
    textAlign: "center",
    textAlignVertical: "center",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  calendarDay: {
    width: "14.2857%",
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  dayText: { color: colors.ink, fontSize: 14 },
  selectedDay: { backgroundColor: colors.steelBlue },
  selectedDayText: { color: colors.surface, fontWeight: "700" },
  selectedDate: { color: colors.muted, fontSize: 13, textAlign: "center" },
  label: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 150,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  kpiLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  kpiValue: { fontSize: 20, fontWeight: "700" },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 42,
    gap: spacing.sm,
  },
  chartDate: { width: 90, color: colors.muted, fontSize: 12 },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.chip,
    overflow: "hidden",
  },
  bar: { height: "100%", backgroundColor: colors.steelBlue, borderRadius: 5 },
  chartValue: {
    width: 100,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },
  inventoryRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  inventoryCopy: { flex: 1, minWidth: 0 },
  inventoryName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  inventoryMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  status: {
    maxWidth: 124,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
});

function DateField({
  label,
  value,
  onChangeText,
  locale,
}: {
  label: string;
  value: string;
  onChangeText(value: string): void;
  locale: "en" | "hi" | "mr";
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });
  const monthStart = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  );
  const dayOffset = (monthStart.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = index - dayOffset + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const isoDay = (day: number) =>
    `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dateFormatter = new Intl.DateTimeFormat(localeTag(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const weekdayFormatter = new Intl.DateTimeFormat(localeTag(locale), {
    weekday: "short",
    timeZone: "UTC",
  });
  const selected = new Date(`${value}T00:00:00.000Z`);
  if (Platform.OS === "web") {
    return (
      <View style={reportStyles.dateField}>
        <Text style={reportStyles.label}>{label}</Text>
        {React.createElement("input", {
          type: "date",
          value,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            onChangeText(event.target.value),
          style: {
            width: "100%",
            height: 46,
            border: "1px solid #E2E8F0",
            borderRadius: 6,
            padding: "0 12px",
            fontSize: 15,
            color: "#334155",
            backgroundColor: "#FFFFFF",
            boxSizing: "border-box",
          },
        })}
      </View>
    );
  }
  return (
    <View style={reportStyles.dateField}>
      <Text style={reportStyles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={reportStyles.nativeDateInput}
      >
        <Text style={reportStyles.nativeDateText}>{value || "YYYY-MM-DD"}</Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={reportStyles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel={translate(locale, "cancel")}
          />
          <View style={reportStyles.calendar}>
            <View style={reportStyles.calendarHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={translate(locale, "previousMonth")}
                onPress={() =>
                  setMonth(
                    new Date(
                      Date.UTC(
                        month.getUTCFullYear(),
                        month.getUTCMonth() - 1,
                        1,
                      ),
                    ),
                  )
                }
                style={reportStyles.monthButton}
              >
                <Text style={reportStyles.monthArrow}>‹</Text>
              </Pressable>
              <Text style={reportStyles.monthTitle}>
                {dateFormatter.format(monthStart)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={translate(locale, "nextMonth")}
                onPress={() =>
                  setMonth(
                    new Date(
                      Date.UTC(
                        month.getUTCFullYear(),
                        month.getUTCMonth() + 1,
                        1,
                      ),
                    ),
                  )
                }
                style={reportStyles.monthButton}
              >
                <Text style={reportStyles.monthArrow}>›</Text>
              </Pressable>
            </View>
            <View style={reportStyles.calendarGrid}>
              {Array.from({ length: 7 }, (_, index) => {
                const date = new Date(Date.UTC(2024, 0, 1 + index));
                return (
                  <Text key={`weekday-${index}`} style={reportStyles.weekday}>
                    {weekdayFormatter.format(date)}
                  </Text>
                );
              })}
              {days.map((day, index) =>
                day === null ? (
                  <View
                    key={`blank-${index}`}
                    style={reportStyles.calendarDay}
                  />
                ) : (
                  <Pressable
                    key={isoDay(day)}
                    onPress={() => {
                      onChangeText(isoDay(day));
                      setOpen(false);
                    }}
                    style={[
                      reportStyles.calendarDay,
                      isoDay(day) === value && reportStyles.selectedDay,
                    ]}
                  >
                    <Text
                      style={[
                        reportStyles.dayText,
                        isoDay(day) === value && reportStyles.selectedDayText,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
            {!Number.isNaN(selected.getTime()) ? (
              <Text style={reportStyles.selectedDate}>
                {new Intl.DateTimeFormat(localeTag(locale), {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(selected)}
              </Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function ReportsScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const today = dayInTimezone("Asia/Kolkata");
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
  const [stock, setStock] = useState<StockBalanceRecord[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [dateError, setDateError] = useState(false);
  const dateInitialized = useRef(false);
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
    if (
      mode !== "VALUATION" &&
      (!isValidDay(from) || !isValidDay(to) || from > to)
    ) {
      setDateError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setDateError(false);
    try {
      const [business, money] = await Promise.all([
        app.getBusiness(user.id),
        app.getBillingCurrency(user.id),
      ]);
      if (!dateInitialized.current) {
        dateInitialized.current = true;
        const businessToday = dayInTimezone(business.timezone);
        if (from !== businessToday || to !== businessToday) {
          setFrom(businessToday);
          setTo(businessToday);
          return;
        }
      }
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
      } else {
        const [value, balances] = await Promise.all([
          app.getInventoryValuation(user.id),
          app.listStockBalances(user.id),
        ]);
        setValuation(value);
        setStock(balances);
      }
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
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const stockUnitKeys = new Set(
    stock.map((row) => `${row.unitName}:${row.unitPrecision}`),
  );
  const stockTotal =
    stockUnitKeys.size <= 1
      ? stock.reduce((sum, row) => sum + row.onHandScaled, 0) /
        10 ** (stock[0]?.unitPrecision ?? 0)
      : null;

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
      <View style={reportStyles.header}>
        <View style={reportStyles.headerCopy}>
          <Heading subtitle={t("reportsSubtitle")}>
            {t("businessReports")}
          </Heading>
          <Body muted>
            {t("timezone")}: {timezone}
          </Body>
        </View>
        <View style={reportStyles.actions}>
          <Button secondary onPress={() => void exportCsv()} disabled={loading}>
            {t("csvExport")}
          </Button>
          <Button secondary onPress={() => void exportPdf()} disabled={loading}>
            {t("exportPdf")}
          </Button>
        </View>
      </View>
      {error ? <ErrorBanner>{errorText(error)}</ErrorBanner> : null}
      {dateError ? <ErrorBanner>{t("reportDateError")}</ErrorBanner> : null}
      <Card>
        <Choice
          selected={mode}
          onSelect={(value) => setMode(value as ReportMode)}
          options={[
            { value: "SALES", label: t("sales") },
            { value: "PURCHASES", label: t("purchases") },
            { value: "VALUATION", label: t("inventory") },
          ]}
        />
        {mode !== "VALUATION" ? (
          <>
            <DateField
              label={t("fromDate")}
              value={from}
              onChangeText={setFrom}
              locale={locale}
            />
            <DateField
              label={t("toDate")}
              value={to}
              onChangeText={setTo}
              locale={locale}
            />
            <Choice
              selected={groupBy}
              onSelect={(value) => setGroupBy(value as typeof groupBy)}
              options={[
                { value: "day", label: t("day") },
                { value: "week", label: t("week") },
                { value: "month", label: t("month") },
              ]}
            />
          </>
        ) : null}
        <Button onPress={() => void load()} disabled={loading}>
          {t("generateReport")}
        </Button>
      </Card>
      {mode === "SALES" && sales ? (
        <>
          <View style={reportStyles.kpiGrid}>
            {[
              {
                label: t("grossSales"),
                value: amount(sales.grossSalesMinor),
                color: colors.deepNavy,
              },
              {
                label: t("netSales"),
                value: amount(sales.netSalesMinor),
                color: colors.steelBlue,
              },
              {
                label: t("paymentsReceived"),
                value: amount(sales.netPaymentsMinor),
                color: colors.success,
              },
              {
                label: t("outstandingAmount"),
                value: amount(sales.outstandingMinor),
                color: colors.warning,
              },
            ].map((item) => (
              <View key={item.label} style={reportStyles.kpi}>
                <Text style={reportStyles.kpiLabel}>{item.label}</Text>
                <Text style={[reportStyles.kpiValue, { color: item.color }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
          <Card>
            <Heading>{t("salesSummary")}</Heading>
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
            <Heading>{t("salesTrend")}</Heading>
            {sales.groups.length === 0 ? (
              <Body muted>{t("noReportData")}</Body>
            ) : null}
            {sales.groups.map((row) => {
              const maximum = Math.max(
                1,
                ...sales.groups.map((group) => group.netSalesMinor),
              );
              return (
                <View key={row.period} style={reportStyles.chartRow}>
                  <Text style={reportStyles.chartDate}>{row.period}</Text>
                  <View style={reportStyles.track}>
                    <View
                      style={[
                        reportStyles.bar,
                        {
                          width: `${Math.max(2, (row.netSalesMinor / maximum) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={reportStyles.chartValue}>
                    {amount(row.netSalesMinor)}
                  </Text>
                </View>
              );
            })}
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
          <View style={reportStyles.kpiGrid}>
            {[
              {
                label: t("purchasesSummary"),
                value: amount(purchases.purchasesMinor),
                color: colors.deepNavy,
              },
              {
                label: t("purchaseReturns"),
                value: amount(purchases.creditsMinor),
                color: colors.warning,
              },
              {
                label: t("netPurchases"),
                value: amount(purchases.netPurchasesMinor),
                color: colors.steelBlue,
              },
              {
                label: t("supplierOutstanding"),
                value: amount(
                  purchases.suppliers.reduce(
                    (sum, row) => sum + row.outstandingMinor,
                    0,
                  ),
                ),
                color: colors.danger,
              },
            ].map((item) => (
              <View key={item.label} style={reportStyles.kpi}>
                <Text style={reportStyles.kpiLabel}>{item.label}</Text>
                <Text style={[reportStyles.kpiValue, { color: item.color }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
          <Card>
            <Heading>{t("purchasesSummary")}</Heading>
            <Body>
              {purchases.purchaseCount} receipts · Purchases{" "}
              {amount(purchases.purchasesMinor)} · Credits{" "}
              {amount(purchases.creditsMinor)} · Net purchases{" "}
              {amount(purchases.netPurchasesMinor)} · Payments{" "}
              {amount(purchases.paymentsMinor)}
            </Body>
          </Card>
          <Card>
            <Heading>{t("purchaseTrend")}</Heading>
            {purchases.groups.length === 0 ? (
              <Body muted>{t("noReportData")}</Body>
            ) : null}
            {purchases.groups.map((row) => {
              const maximum = Math.max(
                1,
                ...purchases.groups.map((group) => group.netPurchasesMinor),
              );
              return (
                <View key={row.period} style={reportStyles.chartRow}>
                  <Text style={reportStyles.chartDate}>{row.period}</Text>
                  <View style={reportStyles.track}>
                    <View
                      style={[
                        reportStyles.bar,
                        {
                          width: `${Math.max(2, (row.netPurchasesMinor / maximum) * 100)}%`,
                          backgroundColor: colors.deepNavy,
                        },
                      ]}
                    />
                  </View>
                  <Text style={reportStyles.chartValue}>
                    {amount(row.netPurchasesMinor)}
                  </Text>
                </View>
              );
            })}
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
          <View style={reportStyles.kpiGrid}>
            {[
              {
                label: t("totalProducts"),
                value: String(stock.length),
                color: colors.deepNavy,
              },
              {
                label: t("totalStock"),
                value:
                  stockTotal === null
                    ? "—"
                    : stockTotal.toLocaleString(localeTag(locale), {
                        maximumFractionDigits: 2,
                      }),
                color: colors.steelBlue,
              },
              {
                label: t("lowStock"),
                value: String(
                  stock.filter(
                    (row) =>
                      row.onHandScaled > 0 &&
                      row.reorderThresholdScaled > 0 &&
                      row.onHandScaled <= row.reorderThresholdScaled,
                  ).length,
                ),
                color: colors.warning,
              },
              {
                label: t("outOfStock"),
                value: String(
                  stock.filter((row) => row.onHandScaled <= 0).length,
                ),
                color: colors.danger,
              },
            ].map((item) => (
              <View key={item.label} style={reportStyles.kpi}>
                <Text style={reportStyles.kpiLabel}>{item.label}</Text>
                <Text style={[reportStyles.kpiValue, { color: item.color }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
          <Card>
            <Heading>{t("inventorySummary")} · FIFO</Heading>
            <Body>
              {t("knownStockValue")}: {amount(valuation.knownValueMinor)}
            </Body>
            <Body>
              Unknown-cost quantity {valuation.unknownQuantityScaled} (in each
              product’s stored unit scale)
            </Body>
          </Card>
          <Card>
            <Heading>{t("inventory")}</Heading>
            {stock.length === 0 ? (
              <Body muted>{t("noStockProducts")}</Body>
            ) : (
              stock.map((row) => {
                const valuationRow = valuation.products.find(
                  (item) => item.productId === row.productId,
                );
                const label =
                  row.onHandScaled <= 0
                    ? t("outOfStock")
                    : row.reorderThresholdScaled <= 0
                      ? t("thresholdNotSet")
                      : row.onHandScaled <= row.reorderThresholdScaled
                        ? t("lowStock")
                        : t("inStock");
                const color =
                  row.onHandScaled <= 0
                    ? colors.danger
                    : row.reorderThresholdScaled > 0 &&
                        row.onHandScaled <= row.reorderThresholdScaled
                      ? colors.warning
                      : row.reorderThresholdScaled > 0
                        ? colors.success
                        : colors.muted;
                return (
                  <View key={row.productId} style={reportStyles.inventoryRow}>
                    <View style={reportStyles.inventoryCopy}>
                      <Text style={reportStyles.inventoryName}>
                        {row.productName}
                      </Text>
                      <Text style={reportStyles.inventoryMeta}>
                        {t("availableQuantity")}:{" "}
                        {formatScaledQuantity(
                          row.onHandScaled,
                          row.unitPrecision,
                        )}{" "}
                        {row.unitName} · {t("minimumStock")}:{" "}
                        {row.reorderThresholdScaled > 0
                          ? formatScaledQuantity(
                              row.reorderThresholdScaled,
                              row.unitPrecision,
                            )
                          : "—"}
                      </Text>
                      {valuationRow ? (
                        <Text style={reportStyles.inventoryMeta}>
                          {amount(valuationRow.knownValueMinor)} ·{" "}
                          {valuationRow.unknownQuantityScaled}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[reportStyles.status, { color }]}>
                      {label}
                    </Text>
                  </View>
                );
              })
            )}
          </Card>
        </>
      ) : null}
    </Page>
  );
}
