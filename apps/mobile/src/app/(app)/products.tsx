import React, { useCallback, useEffect, useState } from "react";
import { getDocumentAsync } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Modal, Platform, Text, View } from "react-native";
import {
  AppError,
  formatMinorUnits,
  localeTag,
  translate,
  type BusinessProfile,
  type CategoryRecord,
  type ProductRecord,
  type UnitRecord,
  type CsvPreviewRow,
} from "@smartbiz/core";
import { BarcodeManager } from "../../components/barcode-manager";
import { ProductEditor } from "../../components/product-editor";
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
import { colors, spacing } from "../../theme";

const pageSize = 30;

export default function ProductsScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [editProduct, setEditProduct] = useState<ProductRecord | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<ProductRecord | null>(
    null,
  );
  const [pendingArchive, setPendingArchive] = useState<ProductRecord | null>(
    null,
  );
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [csvVisible, setCsvVisible] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<CsvPreviewRow[] | null>(null);
  const [csvResult, setCsvResult] = useState<{
    importedCount: number;
    errors: Array<{ rowNumber: number; message: string }>;
  } | null>(null);

  const refresh = useCallback(
    async (append = false, nextOffset = 0) => {
      if (!app || !user) return;
      setLoading(true);
      setError(null);
      try {
        const [productRows, categoryRows, unitRows, profile] =
          await Promise.all([
            app.listProducts(user.id, {
              search,
              ...(categoryId ? { categoryId } : {}),
              includeArchived,
              offset: nextOffset,
              limit: pageSize,
            }),
            app.listCategories(user.id, true),
            app.listUnits(user.id, true),
            app.getBusiness(user.id),
          ]);
        setProducts((current) =>
          append ? [...current, ...productRows] : productRows,
        );
        setCategories(categoryRows);
        setUnits(unitRows);
        setBusiness(profile);
        setOffset(nextOffset);
      } catch (caught) {
        setError(caught);
      } finally {
        setLoading(false);
      }
    },
    [app, user, search, categoryId, includeArchived],
  );

  useEffect(() => {
    const timer = setTimeout(() => void refresh(false, 0), 180);
    return () => clearTimeout(timer);
  }, [refresh]);

  const openNewProduct = () => {
    setEditProduct(null);
    setEditorVisible(true);
  };

  const edit = (product: ProductRecord) => {
    setEditProduct(product);
    setEditorVisible(true);
  };

  const archive = async () => {
    if (!app || !user || !pendingArchive) return;
    try {
      await app.setProductArchived(
        user.id,
        pendingArchive.id,
        !pendingArchive.archivedAt,
      );
      setPendingArchive(null);
      await refresh(false, 0);
    } catch (caught) {
      setError(caught);
      setPendingArchive(null);
    }
  };

  const chooseCsvFile = async () => {
    try {
      const result = await getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      let contents: string;
      if (Platform.OS === "web") {
        if (asset.file) contents = await asset.file.text();
        else if (asset.base64) contents = atob(asset.base64);
        else contents = await (await fetch(asset.uri)).text();
      } else {
        contents = await new File(asset.uri).text();
      }
      setCsvText(contents);
      if (!app || !user) return;
      setCsvPreview(await app.previewProductsCsv(user.id, contents));
      setCsvResult(null);
    } catch (caught) {
      setError(caught);
    }
  };

  const previewCsv = async () => {
    if (!app || !user) return;
    setError(null);
    setCsvResult(null);
    try {
      setCsvPreview(await app.previewProductsCsv(user.id, csvText));
    } catch (caught) {
      setError(caught);
    }
  };

  const importCsv = async () => {
    if (!app || !user) return;
    try {
      const result = await app.importProductsCsv(user.id, csvText);
      setCsvResult(result);
      await refresh(false, 0);
    } catch (caught) {
      setError(caught);
    }
  };

  const exportCsv = async () => {
    if (!app || !user) return;
    setError(null);
    try {
      const contents = await app.exportProductsCsv(user.id);
      const filename = "smartbiz-products.csv";
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
        if (!(await Sharing.isAvailableAsync())) {
          throw new AppError(
            "PERSISTENCE",
            "File sharing is unavailable on this device.",
          );
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/csv",
          dialogTitle: t("csvExport"),
        });
      }
    } catch (caught) {
      setError(caught);
    }
  };

  const openCsv = () => {
    setCsvText("");
    setCsvPreview(null);
    setCsvResult(null);
    setCsvVisible(true);
  };

  const tRole =
    user?.role === "ADMIN"
      ? t("admin")
      : user?.role === "MANAGER"
        ? t("manager")
        : t("cashier");
  return (
    <Page>
      <Heading subtitle={`${t("role")}: ${tRole}`}>{t("products")}</Heading>
      {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
      <Card>
        <Field
          label={t("search")}
          value={search}
          onChangeText={setSearch}
          placeholder={t("searchProducts")}
        />
        <Choice
          selected={categoryId}
          onSelect={setCategoryId}
          options={[
            { value: "", label: t("category") },
            ...categories
              .filter((category) => !category.archivedAt)
              .map((category) => ({
                value: category.id,
                label: category.name,
              })),
          ]}
        />
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <Button onPress={openNewProduct}>{t("addProduct")}</Button>
          <Button secondary onPress={openCsv}>
            {t("csvImport")}
          </Button>
          <Button secondary onPress={() => void exportCsv()}>
            {t("csvExport")}
          </Button>
          <Button
            secondary
            onPress={() => setIncludeArchived((current) => !current)}
          >
            {t("showArchived")}: {includeArchived ? t("complete") : t("active")}
          </Button>
        </View>
      </Card>
      {loading && products.length === 0 ? (
        <Body muted>{t("loading")}</Body>
      ) : null}
      {!loading && products.length === 0 ? (
        <Card>
          <Body muted>{t("noProducts")}</Body>
        </Card>
      ) : null}
      {products.map((product) => (
        <Card key={product.id}>
          <Heading subtitle={`${t("sku")}: ${product.sku}`}>
            {product.name}
          </Heading>
          <Body>
            {formatMinorUnits(
              product.sellingPriceMinor,
              business?.currencyCode ?? "INR",
              localeTag(locale),
              business?.currencyFractionDigits ?? 2,
            )}{" "}
            · {product.unitName}
            {product.categoryName ? ` · ${product.categoryName}` : ""}
          </Body>
          {product.activeBarcode ? (
            <Body muted>
              {t("barcode")}: {product.activeBarcode}
            </Body>
          ) : null}
          {product.archivedAt ? <Body muted>{t("archived")}</Body> : null}
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
          >
            {!product.archivedAt ? (
              <>
                <Button secondary onPress={() => edit(product)}>
                  {t("editProduct")}
                </Button>
                <Button secondary onPress={() => setBarcodeProduct(product)}>
                  {t(product.activeBarcode ? "changeBarcode" : "barcode")}
                </Button>
              </>
            ) : null}
            <Button
              danger={Boolean(!product.archivedAt)}
              secondary={Boolean(product.archivedAt)}
              onPress={() => setPendingArchive(product)}
            >
              {product.archivedAt ? t("restore") : t("archive")}
            </Button>
          </View>
        </Card>
      ))}
      {products.length === pageSize ? (
        <Button
          secondary
          disabled={loading}
          onPress={() => void refresh(true, offset + pageSize)}
        >
          {t("loadMore")}
        </Button>
      ) : null}
      <ProductEditor
        visible={editorVisible}
        product={editProduct}
        categories={categories}
        units={units}
        currencyFractionDigits={business?.currencyFractionDigits ?? 2}
        onClose={() => setEditorVisible(false)}
        onSaved={() => void refresh(false, 0)}
      />
      <BarcodeManager
        visible={Boolean(barcodeProduct)}
        product={barcodeProduct}
        onClose={() => setBarcodeProduct(null)}
        onSaved={() => void refresh(false, 0)}
      />
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(pendingArchive)}
        onRequestClose={() => setPendingArchive(null)}
      >
        <View
          style={{
            backgroundColor: colors.overlay,
            flex: 1,
            justifyContent: "center",
            padding: spacing.md,
          }}
        >
          <Card>
            <Heading>{t("confirmTitle")}</Heading>
            <Body>{t("confirmArchive")}</Body>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              <Button onPress={() => void archive()}>
                {t(pendingArchive?.archivedAt ? "restore" : "archive")}
              </Button>
              <Button secondary onPress={() => setPendingArchive(null)}>
                {t("cancel")}
              </Button>
            </View>
          </Card>
        </View>
      </Modal>
      <Modal
        visible={csvVisible}
        animationType="slide"
        onRequestClose={() => setCsvVisible(false)}
      >
        <Page>
          <Card>
            <Heading>{t("csvImport")}</Heading>
            {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
            <Button secondary onPress={() => void chooseCsvFile()}>
              {t("csvImport")}
            </Button>
            <Field
              label={t("csvPaste")}
              value={csvText}
              onChangeText={setCsvText}
              multiline
              autoCapitalize="none"
            />
            <Button onPress={() => void previewCsv()}>
              {t("previewImport")}
            </Button>
            {csvPreview ? (
              <>
                <Body>
                  {t("validRows")}:{" "}
                  {csvPreview.filter((row) => row.product).length} ·{" "}
                  {t("invalidRows")}:{" "}
                  {csvPreview.filter((row) => row.error).length}
                </Body>
                {csvPreview.map((row) => (
                  <Text
                    key={row.rowNumber}
                    style={{
                      color: row.error ? colors.danger : colors.success,
                    }}
                  >
                    {t("row")} {row.rowNumber}:{" "}
                    {row.error
                      ? t(errorText(new AppError("VALIDATION", row.error)))
                      : row.product?.name}
                  </Text>
                ))}
                <Button
                  disabled={!csvPreview.some((row) => row.product)}
                  onPress={() => void importCsv()}
                >
                  {t("importValid")}
                </Button>
              </>
            ) : null}
            {csvResult ? (
              <Card>
                <Body>
                  {t("csvImportComplete")} {csvResult.importedCount}
                </Body>
                {csvResult.errors.map((item) => (
                  <Text
                    key={`${item.rowNumber}-${item.message}`}
                    style={{ color: colors.danger }}
                  >
                    {t("row")} {item.rowNumber}: {t("errorConflict")}
                  </Text>
                ))}
              </Card>
            ) : null}
            <Button secondary onPress={() => setCsvVisible(false)}>
              {t("cancel")}
            </Button>
          </Card>
        </Page>
      </Modal>
    </Page>
  );
}
