import React, { useEffect, useState } from "react";
import Barcode from "react-native-barcode-svg";
import { Modal, View } from "react-native";
import {
  AppError,
  localeTag,
  translate,
  validateBarcode,
  type BarcodeHistoryRecord,
  type BarcodeSymbology,
  type ProductRecord,
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
} from "./ui";
import { useApp } from "../context/app-context";
import { colors, spacing } from "../theme";

export function BarcodeManager({
  visible,
  product,
  onClose,
  onSaved,
}: {
  visible: boolean;
  product: ProductRecord | null;
  onClose(): void;
  onSaved(): void;
}): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [value, setValue] = useState("");
  const [symbology, setSymbology] = useState<BarcodeSymbology>("CODE128");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<BarcodeHistoryRecord[]>([]);

  useEffect(() => {
    if (!visible) return;
    setValue("");
    setSymbology("CODE128");
    setReason("");
    setError(null);
    setConfirming(false);
    if (product && app && user) {
      void app
        .getBarcodeHistory(user.id, product.id)
        .then(setHistory)
        .catch(setError);
    } else {
      setHistory([]);
    }
  }, [visible, product?.id, app, user]);

  const createPreview = async () => {
    if (!app || !user || !product) return;
    setError(null);
    try {
      const generated = await app.generateBarcodePreview(user.id, product.id);
      setValue(generated.value);
      setSymbology(generated.symbology);
    } catch (caught) {
      setError(caught);
    }
  };

  const save = async () => {
    if (!app || !user || !product) return;
    setSaving(true);
    setError(null);
    try {
      const mapping = { value, symbology };
      if (product.activeBarcode) {
        await app.remapBarcode(user.id, product.id, mapping, reason);
      } else {
        await app.assignBarcode(user.id, product.id, mapping);
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  const validPreview = (() => {
    try {
      return value ? validateBarcode(value, symbology) : null;
    } catch {
      return null;
    }
  })();

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <Page>
        <Card>
          <Heading>
            {t(product?.activeBarcode ? "changeBarcode" : "barcode")}
          </Heading>
          {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
          {product?.activeBarcode ? (
            <Heading>{t("barcodeHistory")}</Heading>
          ) : null}
          {history.map((item) => (
            <View
              key={item.id}
              style={{
                borderColor: colors.border,
                borderBottomWidth: 1,
                gap: spacing.xs,
                paddingVertical: spacing.sm,
              }}
            >
              <Heading
                subtitle={`${new Date(item.occurredAt).toLocaleString(localeTag(locale))} · ${item.reason}`}
              >
                {t(item.eventType === "REMAPPED" ? "remapped" : "assigned")}
              </Heading>
              <Body>
                {item.previousValue ? `${item.previousValue} → ` : ""}
                {item.newValue}
              </Body>
            </View>
          ))}
          <Choice
            selected={symbology}
            onSelect={(selected) =>
              setSymbology(selected === "EAN13" ? "EAN13" : "CODE128")
            }
            options={[
              { value: "CODE128", label: t("code128") },
              { value: "EAN13", label: t("ean13") },
            ]}
          />
          <Field
            label={t("barcodeValue")}
            value={value}
            onChangeText={(text) => setValue(text)}
            autoCapitalize="characters"
          />
          {symbology === "CODE128" ? (
            <Button secondary onPress={() => void createPreview()}>
              {t("generateBarcode")}
            </Button>
          ) : null}
          {validPreview ? (
            <View
              accessibilityLabel={`${t("barcode")} ${validPreview}`}
              style={{
                alignItems: "center",
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 8,
                borderWidth: 1,
                gap: spacing.sm,
                padding: spacing.md,
              }}
            >
              <Barcode
                value={validPreview}
                format={symbology}
                maxWidth={420}
                height={80}
                onError={() =>
                  setError(
                    new AppError(
                      "VALIDATION",
                      "Barcode preview could not be rendered.",
                    ),
                  )
                }
              />
              <Heading>{validPreview}</Heading>
            </View>
          ) : null}
          {product?.activeBarcode ? (
            <Field
              label={t("remapReason")}
              value={reason}
              onChangeText={setReason}
              multiline
            />
          ) : null}
          {confirming ? (
            <View style={{ gap: spacing.sm }}>
              <ErrorBanner>{t("confirmChange")}</ErrorBanner>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: spacing.sm,
                }}
              >
                <Button disabled={saving} onPress={() => void save()}>
                  {t("confirmChange")}
                </Button>
                <Button secondary onPress={() => setConfirming(false)}>
                  {t("cancel")}
                </Button>
              </View>
            </View>
          ) : (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              <Button
                disabled={
                  !validPreview ||
                  saving ||
                  (Boolean(product?.activeBarcode) &&
                    reason.trim().length === 0)
                }
                onPress={() => {
                  if (product?.activeBarcode) setConfirming(true);
                  else void save();
                }}
              >
                {t(product?.activeBarcode ? "changeBarcode" : "assignBarcode")}
              </Button>
              <Button secondary onPress={onClose}>
                {t("cancel")}
              </Button>
            </View>
          )}
        </Card>
      </Page>
    </Modal>
  );
}
