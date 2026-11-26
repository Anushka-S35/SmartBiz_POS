import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { translate } from "@smartbiz/core";
import { Card, Heading, Page } from "../../components/ui";
import { colors, spacing } from "../../theme";
import { useApp } from "../../context/app-context";

export default function MoreScreen(): React.JSX.Element {
  const { locale, user } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const items = [
    {
      label: t("customers"),
      icon: "account-group-outline" as const,
      route: "/(app)/customers",
    },
    ...(user?.role === "CASHIER"
      ? []
      : [
          {
            label: t("suppliers"),
            icon: "truck-outline" as const,
            route: "/(app)/suppliers",
          },
        ]),
    {
      label: t("reports"),
      icon: "chart-box-outline" as const,
      route: "/(app)/reports",
    },
    ...(user?.role === "CASHIER"
      ? []
      : [
          {
            label: t("categoriesUnits"),
            icon: "shape-outline" as const,
            route: "/(app)/categories",
          },
        ]),
    ...(user?.role === "ADMIN"
      ? [
          {
            label: t("team"),
            icon: "account-cog-outline" as const,
            route: "/(app)/team",
          },
        ]
      : []),
    {
      label: t("settings"),
      icon: "cog-outline" as const,
      route: "/(app)/settings",
    },
  ];
  return (
    <Page>
      <Heading subtitle={t("moreDestinations")}>{t("more")}</Heading>
      <Card>
        {items.map((item) => (
          <Pressable
            key={item.route}
            onPress={() => router.push(item.route as never)}
            style={styles.row}
            accessibilityRole="button"
          >
            <View style={styles.icon}>
              <MaterialCommunityIcons
                name={item.icon}
                size={21}
                color={colors.steelBlue}
              />
            </View>
            <Text style={styles.label}>{item.label}</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.muted}
            />
          </Pressable>
        ))}
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F0FDFA",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "600" },
});
