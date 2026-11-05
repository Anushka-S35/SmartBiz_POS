import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Redirect, Tabs, router, usePathname } from "expo-router";
import { translate } from "@smartbiz/core";
import { colors, spacing } from "../../theme";
import { useApp } from "../../context/app-context";

export default function TabLayout(): React.JSX.Element {
  const { locale, user } = useApp();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const desktop = Platform.OS === "web" && width >= 1024;
  if (!user) return <Redirect href="/sign-in" />;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const navigation = [
    { label: t("overview"), route: "/(app)", key: "/" },
    { label: t("billing"), route: "/(app)/billing", key: "/billing" },
    { label: t("products"), route: "/(app)/products", key: "/products" },
    { label: t("inventory"), route: "/(app)/inventory", key: "/inventory" },
    { label: t("customers"), route: "/(app)/customers", key: "/customers" },
    ...(user.role === "CASHIER"
      ? []
      : [
          {
            label: t("suppliers"),
            route: "/(app)/suppliers",
            key: "/suppliers",
          },
        ]),
    { label: t("reports"), route: "/(app)/reports", key: "/reports" },
    ...(user.role === "CASHIER"
      ? []
      : [
          {
            label: t("categoriesUnits"),
            route: "/(app)/categories",
            key: "/categories",
          },
        ]),
    ...(user.role === "ADMIN"
      ? [{ label: t("team"), route: "/(app)/team", key: "/team" }]
      : []),
    { label: t("settings"), route: "/(app)/settings", key: "/settings" },
  ];
  return (
    <View style={styles.shell}>
      {desktop ? (
        <View style={styles.sidebar}>
          <Text style={styles.brand}>SMARTBIZ POS</Text>
          <Text style={styles.groupLabel}>WORKSPACE</Text>
          {navigation.slice(0, 7).map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.route as never)}
              style={[
                styles.navItem,
                pathname.endsWith(item.key) && styles.navActive,
              ]}
            >
              <Text
                style={[
                  styles.navText,
                  pathname.endsWith(item.key) && styles.navTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.groupLabel}>MANAGEMENT</Text>
          {navigation.slice(7).map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.route as never)}
              style={[
                styles.navItem,
                pathname.endsWith(item.key) && styles.navActive,
              ]}
            >
              <Text
                style={[
                  styles.navText,
                  pathname.endsWith(item.key) && styles.navTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.main}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.deepNavy,
            tabBarInactiveTintColor: colors.mutedBlue,
            tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
            tabBarStyle: desktop
              ? { display: "none" }
              : {
                  minHeight: 60,
                  paddingBottom: 6,
                  paddingTop: 4,
                  borderTopColor: colors.border,
                  backgroundColor: colors.surface,
                },
          }}
        >
          <Tabs.Screen
            name="index"
            options={
              desktop
                ? { title: t("overview"), href: null }
                : { title: t("overview") }
            }
          />
          <Tabs.Screen
            name="products"
            options={
              desktop
                ? { title: t("products"), href: null }
                : { title: t("products") }
            }
          />
          <Tabs.Screen
            name="inventory"
            options={{
              title: t("inventory"),
              href: desktop ? null : "/inventory",
            }}
          />
          <Tabs.Screen
            name="customers"
            options={{ title: t("customers"), href: null }}
          />
          <Tabs.Screen
            name="suppliers"
            options={{ title: t("suppliers"), href: null }}
          />
          <Tabs.Screen
            name="reports"
            options={{
              title: t("reports"),
              href: desktop ? null : ("/(app)/reports" as never),
            }}
          />
          <Tabs.Screen
            name="billing"
            options={{ title: t("billing"), href: desktop ? null : "/billing" }}
          />
          <Tabs.Screen
            name="categories"
            options={{
              title: t("categoriesUnits"),
              href: null,
            }}
          />
          <Tabs.Screen
            name="team"
            options={{
              title: t("team"),
              href: null,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: t("settings"), href: null }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", backgroundColor: colors.background },
  sidebar: {
    width: 236,
    backgroundColor: colors.deepNavy,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  brand: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.8,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  groupLabel: {
    color: colors.mutedBlue,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  navItem: {
    minHeight: 42,
    justifyContent: "center",
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
  },
  navActive: { backgroundColor: colors.steelBlue },
  navText: { color: "#E1E5E5", fontSize: 14, fontWeight: "500" },
  navTextActive: { color: colors.surface, fontWeight: "700" },
  main: { flex: 1, minWidth: 0 },
});
