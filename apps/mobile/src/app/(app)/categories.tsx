import React, { useCallback, useEffect, useState } from "react";
import { Modal, View } from "react-native";
import {
  translate,
  type CategoryRecord,
  type UnitRecord,
} from "@smartbiz/core";
import {
  Body,
  Button,
  Card,
  ErrorBanner,
  Field,
  Heading,
  Page,
} from "../../components/ui";
import { useApp } from "../../context/app-context";
import { colors, spacing } from "../../theme";

type PendingArchive = {
  id: string;
  kind: "category" | "unit";
  archived: boolean;
  name: string;
} | null;

export default function CategoriesScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [categoryEdit, setCategoryEdit] = useState<CategoryRecord | null>(null);
  const [unitEdit, setUnitEdit] = useState<UnitRecord | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [formKind, setFormKind] = useState<"category" | "unit">("category");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [precision, setPrecision] = useState("0");
  const [pendingArchive, setPendingArchive] = useState<PendingArchive>(null);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!app || !user) return;
    try {
      const [categoryRows, unitRows] = await Promise.all([
        app.listCategories(user.id, true),
        app.listUnits(user.id, true),
      ]);
      setCategories(categoryRows);
      setUnits(unitRows);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNewCategory = () => {
    setFormKind("category");
    setCategoryEdit(null);
    setName("");
    setFormVisible(true);
  };

  const openCategory = (category: CategoryRecord) => {
    setFormKind("category");
    setCategoryEdit(category);
    setName(category.name);
    setFormVisible(true);
  };

  const openNewUnit = () => {
    setFormKind("unit");
    setUnitEdit(null);
    setName("");
    setCode("");
    setPrecision("0");
    setFormVisible(true);
  };

  const openUnit = (unit: UnitRecord) => {
    setFormKind("unit");
    setUnitEdit(unit);
    setName(unit.name);
    setCode(unit.code);
    setPrecision(String(unit.quantityPrecision));
    setFormVisible(true);
  };

  const save = async () => {
    if (!app || !user) return;
    setError(null);
    try {
      if (formKind === "category") {
        await app.saveCategory(user.id, { name }, categoryEdit?.id);
      } else {
        const quantityPrecision = Number(precision);
        if (!/^\d+$/.test(precision) || !Number.isInteger(quantityPrecision)) {
          throw new Error("Invalid precision");
        }
        await app.saveUnit(
          user.id,
          { name, code, quantityPrecision },
          unitEdit?.id,
        );
      }
      setFormVisible(false);
      await refresh();
    } catch (caught) {
      setError(caught);
    }
  };

  const archive = async () => {
    if (!app || !user || !pendingArchive) return;
    try {
      if (pendingArchive.kind === "category") {
        await app.setCategoryArchived(
          user.id,
          pendingArchive.id,
          !pendingArchive.archived,
        );
      } else {
        await app.setUnitArchived(
          user.id,
          pendingArchive.id,
          !pendingArchive.archived,
        );
      }
      setPendingArchive(null);
      await refresh();
    } catch (caught) {
      setError(caught);
      setPendingArchive(null);
    }
  };

  const renderCategory = (category: CategoryRecord) => (
    <Card key={category.id}>
      <Heading subtitle={category.archivedAt ? t("archived") : t("active")}>
        {category.name}
      </Heading>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Button secondary onPress={() => openCategory(category)}>
          {t("editCategory")}
        </Button>
        <Button
          secondary={Boolean(category.archivedAt)}
          danger={!category.archivedAt}
          onPress={() =>
            setPendingArchive({
              id: category.id,
              kind: "category",
              archived: Boolean(category.archivedAt),
              name: category.name,
            })
          }
        >
          {category.archivedAt ? t("restore") : t("archive")}
        </Button>
      </View>
    </Card>
  );

  const renderUnit = (unit: UnitRecord) => (
    <Card key={unit.id}>
      <Heading
        subtitle={`${unit.code} · ${t("quantityPrecision")}: ${unit.quantityPrecision}`}
      >
        {unit.name}
      </Heading>
      {unit.archivedAt ? <Body muted>{t("archived")}</Body> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
        <Button secondary onPress={() => openUnit(unit)}>
          {t("editUnit")}
        </Button>
        <Button
          secondary={Boolean(unit.archivedAt)}
          danger={!unit.archivedAt}
          onPress={() =>
            setPendingArchive({
              id: unit.id,
              kind: "unit",
              archived: Boolean(unit.archivedAt),
              name: unit.name,
            })
          }
        >
          {unit.archivedAt ? t("restore") : t("archive")}
        </Button>
      </View>
    </Card>
  );

  return (
    <Page>
      <Heading>{t("categoriesUnits")}</Heading>
      {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
      <Card>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Heading>{t("category")}</Heading>
          <Button onPress={openNewCategory}>{t("addCategory")}</Button>
        </View>
        {categories.length === 0 ? (
          <Body muted>{t("noCategories")}</Body>
        ) : (
          categories.map(renderCategory)
        )}
      </Card>
      <Card>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Heading>{t("units")}</Heading>
          <Button onPress={openNewUnit}>{t("addUnit")}</Button>
        </View>
        {units.map(renderUnit)}
      </Card>
      <Modal
        visible={formVisible}
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <Page>
          <Card>
            <Heading>
              {t(
                formKind === "category"
                  ? categoryEdit
                    ? "editCategory"
                    : "addCategory"
                  : unitEdit
                    ? "editUnit"
                    : "addUnit",
              )}
            </Heading>
            {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
            <Field
              label={t(formKind === "category" ? "categoryName" : "unitName")}
              value={name}
              onChangeText={setName}
            />
            {formKind === "unit" ? (
              <>
                <Field
                  label={t("unitCode")}
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="none"
                />
                <Field
                  label={t("quantityPrecision")}
                  value={precision}
                  onChangeText={setPrecision}
                  keyboardType="number-pad"
                />
              </>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              <Button onPress={() => void save()}>{t("save")}</Button>
              <Button secondary onPress={() => setFormVisible(false)}>
                {t("cancel")}
              </Button>
            </View>
          </Card>
        </Page>
      </Modal>
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
            <Body>
              {t("confirmArchive")} {pendingArchive?.name}
            </Body>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              <Button onPress={() => void archive()}>
                {t(pendingArchive?.archived ? "restore" : "archive")}
              </Button>
              <Button secondary onPress={() => setPendingArchive(null)}>
                {t("cancel")}
              </Button>
            </View>
          </Card>
        </View>
      </Modal>
    </Page>
  );
}
