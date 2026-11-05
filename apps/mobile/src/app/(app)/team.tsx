import React, { useCallback, useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { translate, type UserRecord, type UserRole } from "@smartbiz/core";
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

type PendingAction =
  | { user: UserRecord; kind: "role"; role: UserRole }
  | { user: UserRecord; kind: "disabled" }
  | null;

export default function TeamScreen(): React.JSX.Element {
  const { app, user, locale, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("CASHIER");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!app || !user) return;
    try {
      setUsers(await app.listUsers(user.id));
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = async () => {
    if (!app || !user) return;
    setSaving(true);
    setError(null);
    try {
      await app.createUser(user.id, {
        email,
        displayName: name,
        password,
        role,
      });
      setCreateVisible(false);
      setName("");
      setEmail("");
      setPassword("");
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  const confirmAction = async () => {
    if (!app || !user || !pendingAction) return;
    setSaving(true);
    setError(null);
    try {
      if (pendingAction.kind === "role") {
        await app.updateUserRole(
          user.id,
          pendingAction.user.id,
          pendingAction.role,
        );
      } else {
        await app.setUserDisabled(
          user.id,
          pendingAction.user.id,
          !pendingAction.user.disabledAt,
        );
      }
      setPendingAction(null);
      await refresh();
    } catch (caught) {
      setError(caught);
      setPendingAction(null);
    } finally {
      setSaving(false);
    }
  };

  const roleTitle = (value: UserRole) =>
    value === "ADMIN"
      ? t("admin")
      : value === "MANAGER"
        ? t("manager")
        : t("cashier");

  return (
    <Page>
      <Heading>{t("team")}</Heading>
      {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
      <Button onPress={() => setCreateVisible(true)}>{t("addUser")}</Button>
      {users.length === 0 ? (
        <Card>
          <Body muted>{t("noUsers")}</Body>
        </Card>
      ) : null}
      {users.map((item) => (
        <Card key={item.id}>
          <Heading
            subtitle={`${item.email} · ${item.disabledAt ? t("disabled") : t("active")}`}
          >
            {item.displayName}
          </Heading>
          <Choice
            selected={item.role}
            onSelect={(nextRole) => {
              if (nextRole === item.role) return;
              if (
                nextRole === "ADMIN" ||
                nextRole === "MANAGER" ||
                nextRole === "CASHIER"
              ) {
                setPendingAction({ user: item, kind: "role", role: nextRole });
              }
            }}
            options={[
              { value: "ADMIN", label: t("admin") },
              { value: "MANAGER", label: t("manager") },
              { value: "CASHIER", label: t("cashier") },
            ]}
          />
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
          >
            <Button
              secondary={Boolean(item.disabledAt)}
              danger={!item.disabledAt}
              onPress={() => setPendingAction({ user: item, kind: "disabled" })}
            >
              {item.disabledAt ? t("enable") : t("disable")}
            </Button>
          </View>
        </Card>
      ))}
      <Modal
        visible={createVisible}
        animationType="slide"
        onRequestClose={() => setCreateVisible(false)}
      >
        <Page>
          <Card>
            <Heading>{t("addUser")}</Heading>
            {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
            <Field label={t("userName")} value={name} onChangeText={setName} />
            <Field
              label={t("email")}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label={t("password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <Heading>{t("userRole")}</Heading>
            <Choice
              selected={role}
              onSelect={(value) => {
                if (
                  value === "ADMIN" ||
                  value === "MANAGER" ||
                  value === "CASHIER"
                )
                  setRole(value);
              }}
              options={[
                { value: "ADMIN", label: t("admin") },
                { value: "MANAGER", label: t("manager") },
                { value: "CASHIER", label: t("cashier") },
              ]}
            />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              <Button disabled={saving} onPress={() => void create()}>
                {t("save")}
              </Button>
              <Button secondary onPress={() => setCreateVisible(false)}>
                {t("cancel")}
              </Button>
            </View>
          </Card>
        </Page>
      </Modal>
      <Modal
        transparent
        animationType="fade"
        visible={Boolean(pendingAction)}
        onRequestClose={() => setPendingAction(null)}
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
              {pendingAction?.kind === "role"
                ? `${pendingAction.user.displayName}: ${t("role")} → ${roleTitle(pendingAction.role)}`
                : `${pendingAction?.user.displayName}: ${pendingAction?.user.disabledAt ? t("enable") : t("disable")}`}
            </Body>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: spacing.sm,
              }}
            >
              <Button disabled={saving} onPress={() => void confirmAction()}>
                {t("complete")}
              </Button>
              <Button secondary onPress={() => setPendingAction(null)}>
                {t("cancel")}
              </Button>
            </View>
          </Card>
        </View>
      </Modal>
    </Page>
  );
}
