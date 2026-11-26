import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect, Tabs, router, usePathname } from "expo-router";
import { translate } from "@smartbiz/core";
import { colors, radii, spacing } from "../../theme";
import { useApp } from "../../context/app-context";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type NavItem = { label: string; route: string; key: string; icon: IconName };

export default function TabLayout(): React.JSX.Element {
  const { locale, user } = useApp();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const desktop = Platform.OS === "web" && width >= 1024;
  if (!user) return <Redirect href="/sign-in" />;
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const navigation: NavItem[] = [
    {
      label: t("overview"),
      route: "/(app)",
      key: "/",
      icon: "view-dashboard-outline",
    },
    {
      label: t("billing"),
      route: "/(app)/billing",
      key: "/billing",
      icon: "point-of-sale",
    },
    {
      label: t("products"),
      route: "/(app)/products",
      key: "/products",
      icon: "tag-multiple-outline",
    },
    {
      label: t("inventory"),
      route: "/(app)/inventory",
      key: "/inventory",
      icon: "package-variant-closed",
    },
    {
      label: t("customers"),
      route: "/(app)/customers",
      key: "/customers",
      icon: "account-group-outline",
    },
    ...(user.role === "CASHIER"
      ? []
      : [
          {
            label: t("suppliers"),
            route: "/(app)/suppliers",
            key: "/suppliers",
            icon: "truck-outline" as const,
          },
        ]),
    {
      label: t("reports"),
      route: "/(app)/reports",
      key: "/reports",
      icon: "chart-box-outline",
    },
    ...(user.role === "CASHIER"
      ? []
      : [
          {
            label: t("categoriesUnits"),
            route: "/(app)/categories",
            key: "/categories",
            icon: "shape-outline" as const,
          },
        ]),
    ...(user.role === "ADMIN"
      ? [
          {
            label: t("team"),
            route: "/(app)/team",
            key: "/team",
            icon: "account-cog-outline" as const,
          },
        ]
      : []),
    {
      label: t("settings"),
      route: "/(app)/settings",
      key: "/settings",
      icon: "cog-outline",
    },
  ];
  return (
    <View style={styles.shell}>
      {desktop ? (
        <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons
              name="storefront-outline"
              size={22}
              color={colors.surface}
            />
            {!collapsed ? <Text style={styles.brand}>SMARTBIZ POS</Text> : null}
          </View>
          {navigation.map((item) => {
            const active =
              item.key === "/"
                ? pathname === "/" || pathname === "/(app)"
                : pathname.endsWith(item.key);
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => router.push(item.route as never)}
                style={[styles.navItem, active && styles.navActive]}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={20}
                  color={active ? colors.surface : "#CBD5E1"}
                />
                {!collapsed ? (
                  <Text
                    style={[styles.navText, active && styles.navTextActive]}
                  >
                    {item.label}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          <View style={styles.sidebarFooter}>
            <Pressable
              onPress={() => setCollapsed((value) => !value)}
              style={styles.collapseButton}
              accessibilityRole="button"
              accessibilityLabel={
                collapsed ? t("expandSidebar") : t("collapseSidebar")
              }
            >
              <MaterialCommunityIcons
                name={collapsed ? "chevron-right" : "chevron-left"}
                size={20}
                color="#CBD5E1"
              />
              {!collapsed ? (
                <Text style={styles.navText}>{t("collapseSidebar")}</Text>
              ) : null}
            </Pressable>
          </View>
        </View>
      ) : null}
      <View style={styles.main}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.steelBlue,
            tabBarInactiveTintColor: colors.mutedBlue,
            tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
            tabBarStyle: desktop ? { display: "none" } : styles.tabBar,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: t("overview"),
              href: desktop ? null : ("/" as never),
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="view-dashboard-outline"
                  color={color}
                  size={size}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="billing"
            options={{
              title: t("billing"),
              href: desktop ? null : "/billing",
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="point-of-sale"
                  color={color}
                  size={size}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="products"
            options={{
              title: t("products"),
              href: desktop ? null : "/products",
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="tag-multiple-outline"
                  color={color}
                  size={size}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="inventory"
            options={{
              title: t("inventory"),
              href: desktop ? null : "/inventory",
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="package-variant-closed"
                  color={color}
                  size={size}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="more"
            options={{
              title: t("more"),
              href: desktop ? null : ("/more" as never),
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons
                  name="dots-horizontal-circle-outline"
                  color={color}
                  size={size}
                />
              ),
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
            options={{ title: t("reports"), href: null }}
          />
          <Tabs.Screen
            name="categories"
            options={{ title: t("categoriesUnits"), href: null }}
          />
          <Tabs.Screen name="team" options={{ title: t("team"), href: null }} />
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
    width: 240,
    backgroundColor: colors.deepNavy,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  sidebarCollapsed: { width: 76, paddingHorizontal: spacing.sm },
  brandRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  brand: {
    color: colors.surface,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  navItem: {
    minHeight: 46,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  navActive: { backgroundColor: colors.steelBlue },
  navText: { color: "#CBD5E1", fontSize: 14, fontWeight: "500" },
  navTextActive: { color: colors.surface, fontWeight: "700" },
  sidebarFooter: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: spacing.md,
  },
  collapseButton: {
    minHeight: 44,
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  main: { flex: 1, minWidth: 0 },
  tabBar: {
    minHeight: 64,
    paddingBottom: 7,
    paddingTop: 5,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
