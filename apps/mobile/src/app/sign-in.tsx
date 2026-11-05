import React, { useState } from "react";
import { router } from "expo-router";
import { translate } from "@smartbiz/core";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Heading,
  Page,
} from "../components/ui";
import { useApp } from "../context/app-context";

export default function SignInScreen(): React.JSX.Element {
  const { locale, signIn, errorText } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace("/(app)");
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <Card>
        <Heading subtitle={t("signInIntro")}>{t("appName")}</Heading>
        {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
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
        <Button
          disabled={busy || email.trim().length === 0 || password.length === 0}
          onPress={() => void submit()}
        >
          {busy ? t("loading") : t("signIn")}
        </Button>
      </Card>
    </Page>
  );
}
