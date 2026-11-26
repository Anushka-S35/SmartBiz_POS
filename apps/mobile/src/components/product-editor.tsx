import React, { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import {
  translate,
  type CategoryRecord,
  type ProductInput,
  type ProductRecord,
  type UnitRecord,
} from "@smartbiz/core";
import { minorUnitsToDecimal, formatScaledQuantity } from "@smartbiz/core";
import { Button, Card, Choice, ErrorBanner, Field, Heading, Page } from "./ui";
import { useApp } from "../context/app-context";
import { spacing } from "../theme";

function emptyProduct(unitId = ""): ProductInput {
  return {
    name: "",
    sku: "",
    description: "",
    taxCategory: "",
    hsnSacCode: "",
    gstSupplyType: "TAXABLE",
    gstPricingMode: "EXCLUSIVE",
    categoryId: null,
    unitId,
    purchasePrice: "",
    sellingPrice: "",
    reorderThreshold: "0",
  };
}

export function ProductEditor({
  visible,
  product,
  categories,
  units,
  currencyFractionDigits,
  onClose,
  onSaved,
}: {
  visible: boolean;
  product: ProductRecord | null;
  categories: CategoryRecord[];
  units: UnitRecord[];
  currencyFractionDigits: number;
  onClose(): void;
  onSaved(): void;
}): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [form, setForm] = useState<ProductInput>(emptyProduct());
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        description: product.description,
        taxCategory: product.taxCategory,
        hsnSacCode: product.hsnSacCode,
        gstSupplyType: product.gstSupplyType,
        gstPricingMode: product.gstPricingMode,
        categoryId: product.categoryId,
        unitId: product.unitId,
        purchasePrice: minorUnitsToDecimal(
          product.purchasePriceMinor,
          currencyFractionDigits,
        ),
        sellingPrice: minorUnitsToDecimal(
          product.sellingPriceMinor,
          currencyFractionDigits,
        ),
        reorderThreshold: formatScaledQuantity(
          product.reorderThresholdScaled,
          product.unitPrecision,
        ),
      });
    } else {
      setForm(
        emptyProduct(
          units.find((unit) => unit.code === "piece")?.id ?? units[0]?.id ?? "",
        ),
      );
    }
    setError(null);
  }, [product, visible, units, currencyFractionDigits]);

  const update = <K extends keyof ProductInput>(
    key: K,
    value: ProductInput[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!app || !user) return;
    setError(null);
    setSaving(true);
    try {
      await app.saveProduct(user.id, form, product?.id, product?.version);
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <Page>
        <Card>
          <Heading>{t(product ? "editProduct" : "addProduct")}</Heading>
          {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
          <Field
            label={t("productName")}
            value={form.name}
            onChangeText={(text) => update("name", text)}
          />
          <Field
            label={t("sku")}
            value={form.sku}
            onChangeText={(text) => update("sku", text)}
            autoCapitalize="characters"
          />
          <Field
            label={t("description")}
            value={form.description}
            onChangeText={(text) => update("description", text)}
            multiline
          />
          <Field
            label={t("taxCategory")}
            value={form.taxCategory}
            onChangeText={(text) => update("taxCategory", text)}
          />
          <Field
            label={t("hsnSacCode")}
            value={form.hsnSacCode ?? ""}
            onChangeText={(text) =>
              update("hsnSacCode", text.replace(/\D/g, "").slice(0, 8))
            }
            keyboardType="number-pad"
          />
          <View style={{ gap: spacing.xs }}>
            <Heading>{t("gstSupplyClassification")}</Heading>
            <Choice
              selected={form.gstSupplyType ?? "TAXABLE"}
              onSelect={(selected) => {
                if (
                  ["TAXABLE", "EXEMPT", "NIL_RATED", "NON_GST"].includes(
                    selected,
                  )
                )
                  update(
                    "gstSupplyType",
                    selected as NonNullable<ProductInput["gstSupplyType"]>,
                  );
              }}
              options={[
                { value: "TAXABLE", label: t("gstSupplyTaxable") },
                { value: "EXEMPT", label: t("gstSupplyExempt") },
                { value: "NIL_RATED", label: t("gstSupplyNilRated") },
                { value: "NON_GST", label: t("gstSupplyNonGst") },
              ]}
            />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Heading>{t("gstPricingMode")}</Heading>
            <Choice
              selected={form.gstPricingMode ?? "EXCLUSIVE"}
              onSelect={(selected) => {
                if (selected === "INCLUSIVE" || selected === "EXCLUSIVE")
                  update("gstPricingMode", selected);
              }}
              options={[
                { value: "EXCLUSIVE", label: t("gstPricingExclusive") },
                { value: "INCLUSIVE", label: t("gstPricingInclusive") },
              ]}
            />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Heading>{t("category")}</Heading>
            <Choice
              selected={form.categoryId ?? ""}
              onSelect={(value) => update("categoryId", value || null)}
              options={[
                { value: "", label: "—" },
                ...categories
                  .filter((category) => !category.archivedAt)
                  .map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
              ]}
            />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Heading>{t("unit")}</Heading>
            <Choice
              selected={form.unitId}
              onSelect={(value) => {
                const unit = units.find((item) => item.id === value);
                update("unitId", value);
                if (unit) update("reorderThreshold", "0");
              }}
              options={units
                .filter((unit) => !unit.archivedAt)
                .map((unit) => ({ value: unit.id, label: unit.name }))}
            />
          </View>
          <Field
            label={t("purchasePrice")}
            value={form.purchasePrice}
            onChangeText={(text) => update("purchasePrice", text)}
            keyboardType="decimal-pad"
          />
          <Field
            label={t("sellingPrice")}
            value={form.sellingPrice}
            onChangeText={(text) => update("sellingPrice", text)}
            keyboardType="decimal-pad"
          />
          <Field
            label={t("reorderThreshold")}
            value={form.reorderThreshold}
            onChangeText={(text) => update("reorderThreshold", text)}
            keyboardType="decimal-pad"
          />
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
          >
            <Button disabled={saving} onPress={() => void save()}>
              {t("save")}
            </Button>
            <Button secondary onPress={onClose}>
              {t("cancel")}
            </Button>
          </View>
        </Card>
      </Page>
    </Modal>
  );
}
