import React, { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import {
  translate,
  type BusinessProfile,
  type ProductRecord,
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

export default function OverviewScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!app || !user) return;
    try {
      const [profile, rows] = await Promise.all([
        app.getBusiness(user.id),
        app.listProducts(user.id, { limit: 5 }),
      ]);
      setBusiness(profile);
      setProducts(rows);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page>
      <Heading subtitle={`${t("welcome")}, ${user?.displayName ?? ""}`}>
        {business?.displayName ?? t("appName")}
      </Heading>
      {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
      <Card>
        <Heading>{t("products")}</Heading>
        {products.length === 0 ? (
          <Body muted>{t("noProducts")}</Body>
        ) : (
          products.map((product) => (
            <Body key={product.id}>
              {product.name} · {product.sku}
            </Body>
          ))
        )}
      </Card>
      <Card>
        <Heading>{t("businessProfile")}</Heading>
        <Body muted>
          {t("role")}:{" "}
          {user?.role === "ADMIN"
            ? t("admin")
            : user?.role === "MANAGER"
              ? t("manager")
              : t("cashier")}
        </Body>
        <Body muted>
          {business?.currencyCode} · {business?.timezone}
        </Body>
      </Card>
      <Button onPress={() => router.push("/(app)/products")}>
        {t("products")}
      </Button>
      <Button onPress={() => router.push("./inventory")}>Inventory</Button>
      <Button onPress={() => router.push("./customers")}>Customers</Button>
      {user && (user.role === "ADMIN" || user.role === "MANAGER") ? (
        <Button onPress={() => router.push("./suppliers")}>
          Suppliers & purchases
        </Button>
      ) : null}
      <Button onPress={() => router.push("./billing")}>Billing</Button>
      <Button onPress={() => router.push("./reports")}>Sales reports</Button>
    </Page>
  );
}
