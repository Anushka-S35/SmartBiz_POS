import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  formatMinorUnits,
  formatScaledQuantity,
  localeTag,
  translate,
  type BusinessProfile,
  type InvoiceRecord,
  type SalesReport,
  type StockBalanceRecord,
} from "@smartbiz/core";
import {
  Body,
  Button,
  Card,
  ErrorBanner,
  Heading,
  Page,
} from "../../components/ui";
import { useApp } from "../../context/app-context";
import { colors, radii, spacing } from "../../theme";

function businessDay(timezone: string): string {
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

function dayBoundary(day: string, timezone: string): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const target = Date.UTC(year, month - 1, date);
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
    const p = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, part.value]),
    );
    guess +=
      target -
      Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        Number(p.hour),
        Number(p.minute),
        Number(p.second),
      );
  }
  return new Date(guess).toISOString();
}

export default function OverviewScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [products, setProducts] = useState<StockBalanceRecord[]>([]);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [recentSales, setRecentSales] = useState<InvoiceRecord[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!app || !user) return;
    try {
      const profile = await app.getBusiness(user.id);
      const today = businessDay(profile.timezone);
      const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
      tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
      const [balances, report, invoices] = await Promise.all([
        app.listStockBalances(user.id),
        app.getSalesReport(user.id, {
          from: dayBoundary(today, profile.timezone),
          to: dayBoundary(
            tomorrowDate.toISOString().slice(0, 10),
            profile.timezone,
          ),
          groupBy: "day",
        }),
        app.listInvoices(user.id),
      ]);
      setBusiness(profile);
      setProducts(balances);
      setSales(report);
      setRecentSales(
        invoices.filter((invoice) => invoice.status === "POSTED").slice(0, 5),
      );
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user]);

  useEffect(() => {
    void load();
  }, [load]);
  const counts = useMemo(
    () => ({
      out: products.filter((row) => row.onHandScaled <= 0).length,
      low: products.filter(
        (row) =>
          row.onHandScaled > 0 &&
          row.reorderThresholdScaled > 0 &&
          row.onHandScaled <= row.reorderThresholdScaled,
      ).length,
      healthy: products.filter(
        (row) =>
          row.onHandScaled > row.reorderThresholdScaled &&
          row.reorderThresholdScaled > 0,
      ).length,
      unconfigured: products.filter(
        (row) => row.onHandScaled > 0 && row.reorderThresholdScaled <= 0,
      ).length,
    }),
    [products],
  );
  const amount = (value: number) =>
    formatMinorUnits(
      value,
      business?.currencyCode ?? "INR",
      localeTag(locale),
      business?.currencyFractionDigits ?? 2,
    );
  const stockUnitKeys = new Set(
    products.map((row) => `${row.unitName}:${row.unitPrecision}`),
  );
  const stockTotal =
    stockUnitKeys.size <= 1
      ? products.reduce((sum, row) => sum + row.onHandScaled, 0) /
        10 ** (products[0]?.unitPrecision ?? 0)
      : null;
  const dayLabel = business
    ? new Intl.DateTimeFormat(localeTag(locale), {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: business.timezone,
      }).format(new Date())
    : "";
  const statusFor = (item: StockBalanceRecord) =>
    item.onHandScaled <= 0
      ? t("outOfStock")
      : item.reorderThresholdScaled <= 0
        ? t("thresholdNotSet")
        : item.onHandScaled <= item.reorderThresholdScaled
          ? t("lowStock")
          : t("inStock");
  const statusColor = (item: StockBalanceRecord) =>
    item.onHandScaled <= 0
      ? colors.danger
      : item.reorderThresholdScaled > 0 &&
          item.onHandScaled <= item.reorderThresholdScaled
        ? colors.warning
        : item.reorderThresholdScaled <= 0
          ? colors.muted
          : colors.success;
  const kpis = [
    {
      label: t("todaysSales"),
      value: sales ? amount(sales.netSalesMinor) : "—",
      icon: "cash-multiple" as const,
      color: colors.steelBlue,
    },
    {
      label: t("paymentsReceived"),
      value: sales ? amount(sales.netPaymentsMinor) : "—",
      icon: "credit-card-check-outline" as const,
      color: colors.success,
    },
    {
      label: t("outstandingAmount"),
      value: sales ? amount(sales.outstandingMinor) : "—",
      icon: "clock-alert-outline" as const,
      color: colors.warning,
    },
    {
      label: t("totalProducts"),
      value: String(products.length),
      icon: "package-variant-closed" as const,
      color: colors.information,
    },
  ];

  return (
    <Page>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.welcome}>
            {t("welcome")}, {user?.displayName}
          </Text>
          <Heading subtitle={dayLabel}>
            {business?.displayName ?? t("appName")}
          </Heading>
        </View>
        <Button onPress={() => router.push("/(app)/billing")}>
          {t("openBilling")}
        </Button>
      </View>
      <Text style={styles.intro}>{t("dashboardIntro")}</Text>
      {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
      <View style={styles.grid}>
        {kpis.map((item) => (
          <View key={item.label} style={styles.kpi}>
            <View
              style={[styles.kpiIcon, { backgroundColor: `${item.color}14` }]}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={20}
                color={item.color}
              />
            </View>
            <Text style={styles.kpiLabel}>{item.label}</Text>
            <Text style={styles.kpiValue}>{item.value}</Text>
          </View>
        ))}
      </View>
      <Card>
        <View style={styles.sectionHeader}>
          <View>
            <Heading>{t("inventoryHealth")}</Heading>
            <Body muted>
              {t("activeProducts")}: {products.length} · {t("stockQuantity")}:{" "}
              {stockTotal === null
                ? "—"
                : stockTotal.toLocaleString(localeTag(locale), {
                    maximumFractionDigits: 2,
                  })}
            </Body>
          </View>
          <Pressable
            onPress={() => router.push("/(app)/inventory")}
            style={styles.linkButton}
          >
            <Text style={styles.link}>{t("inventory")}</Text>
            <MaterialCommunityIcons
              name="arrow-top-right"
              size={16}
              color={colors.steelBlue}
            />
          </Pressable>
        </View>
        <View style={styles.summaryGrid}>
          {[
            {
              label: t("healthyStock"),
              value: counts.healthy,
              color: colors.success,
            },
            { label: t("lowStock"), value: counts.low, color: colors.warning },
            { label: t("outOfStock"), value: counts.out, color: colors.danger },
            {
              label: t("thresholdNotSet"),
              value: counts.unconfigured,
              color: colors.muted,
            },
          ].map((item) => (
            <View key={item.label} style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: item.color }]}>
                {item.value}
              </Text>
              <Text style={styles.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
        {products.length > 0 && !compact ? (
          <View style={styles.stockHeader}>
            <Text style={[styles.headerLabel, styles.productName]}>
              {t("products")}
            </Text>
            <Text style={[styles.headerLabel, styles.quantity]}>
              {t("availableQuantity")}
            </Text>
            <Text style={[styles.headerLabel, styles.quantity]}>
              {t("minimumStock")}
            </Text>
            <Text style={[styles.headerLabel, styles.status]}>
              {t("status")}
            </Text>
          </View>
        ) : null}
        {products.length === 0 ? (
          <Body muted>{t("noStockProducts")}</Body>
        ) : (
          products
            .slice()
            .sort((a, b) =>
              a.onHandScaled <= 0
                ? -1
                : b.onHandScaled <= 0
                  ? 1
                  : a.lowStock === b.lowStock
                    ? a.productName.localeCompare(b.productName)
                    : a.lowStock
                      ? -1
                      : 1,
            )
            .slice(0, 8)
            .map((item) => (
              <Pressable
                key={item.productId}
                onPress={() => router.push("/(app)/inventory")}
                style={[styles.stockRow, compact && styles.compactStockRow]}
              >
                <View style={styles.productName}>
                  <Text style={styles.rowTitle}>{item.productName}</Text>
                  <Text style={styles.rowMeta}>{item.sku}</Text>
                </View>
                {compact ? (
                  <View style={styles.compactDetails}>
                    <Text style={styles.rowMeta}>
                      {t("availableQuantity")}:{" "}
                      {formatScaledQuantity(
                        item.onHandScaled,
                        item.unitPrecision,
                      )}{" "}
                      {item.unitName}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {t("minimumStock")}:{" "}
                      {item.reorderThresholdScaled > 0
                        ? formatScaledQuantity(
                            item.reorderThresholdScaled,
                            item.unitPrecision,
                          )
                        : "—"}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.quantity}>
                      {formatScaledQuantity(
                        item.onHandScaled,
                        item.unitPrecision,
                      )}{" "}
                      {item.unitName}
                    </Text>
                    <Text style={styles.quantity}>
                      {item.reorderThresholdScaled > 0
                        ? formatScaledQuantity(
                            item.reorderThresholdScaled,
                            item.unitPrecision,
                          )
                        : "—"}
                    </Text>
                  </>
                )}
                <Text style={[styles.status, { color: statusColor(item) }]}>
                  {statusFor(item)}
                </Text>
              </Pressable>
            ))
        )}
      </Card>
      <Card>
        <View style={styles.sectionHeader}>
          <Heading>{t("recentSales")}</Heading>
          <Pressable onPress={() => router.push("/(app)/billing")}>
            <Text style={styles.link}>{t("billing")}</Text>
          </Pressable>
        </View>
        {recentSales.length === 0 ? (
          <Body muted>{t("noRecentSales")}</Body>
        ) : (
          recentSales.map((invoice) => (
            <View key={invoice.id} style={styles.saleRow}>
              <View style={styles.productName}>
                <Text style={styles.rowTitle}>{invoice.invoiceNumber}</Text>
                <Text style={styles.rowMeta}>
                  {invoice.customerName} ·{" "}
                  {new Date(
                    invoice.postedAt ?? invoice.createdAt,
                  ).toLocaleString(localeTag(locale), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Text>
              </View>
              <Text style={styles.saleAmount}>
                {amount(invoice.totalMinor)}
              </Text>
            </View>
          ))
        )}
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  heroCopy: { flex: 1, minWidth: 240 },
  welcome: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  intro: { color: colors.muted, fontSize: 14, marginTop: -spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  kpi: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 150,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  kpiIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  kpiValue: { color: colors.deepNavy, fontSize: 22, fontWeight: "700" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  linkButton: {
    minHeight: 44,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  link: { color: colors.steelBlue, fontSize: 14, fontWeight: "700" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  summaryItem: {
    flexGrow: 1,
    flexBasis: "20%",
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  summaryValue: { fontSize: 22, fontWeight: "700" },
  summaryLabel: { color: colors.muted, fontSize: 12, marginTop: 3 },
  stockRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  compactStockRow: { flexWrap: "wrap", rowGap: spacing.xs },
  compactDetails: { flex: 1, minWidth: 125 },
  productName: { flex: 2, minWidth: 100 },
  rowTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  quantity: { flex: 1, color: colors.ink, fontSize: 13 },
  status: { minWidth: 92, fontSize: 12, fontWeight: "700", textAlign: "right" },
  stockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  saleRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  saleAmount: { color: colors.deepNavy, fontSize: 15, fontWeight: "700" },
});
