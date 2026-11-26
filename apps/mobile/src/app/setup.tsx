import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { router } from "expo-router";
import { AppError, translate, type BusinessProfileInput } from "@smartbiz/core";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Heading,
  Page,
} from "../components/ui";
import { BusinessProfileFields } from "../components/business-profile-fields";
import { useApp } from "../context/app-context";
import { colors, spacing } from "../theme";

const initialProfile: BusinessProfileInput = {
  legalName: "",
  displayName: "",
  address: "",
  phone: "",
  email: "",
  logoUri: "",
  currencyCode: "INR",
  timezone: "Asia/Kolkata",
  invoicePrefix: "SB",
  taxEnabled: false,
  taxRegistrationId: "",
  gstRegistrationType: "NOT_CONFIGURED",
  gstTradeName: "",
  gstStateCode: "",
  gstRegisteredAddress: "",
  gstFinancialYearStartMonth: 4,
  gstInvoicePrefix: "GST",
  gstInvoiceFooter: "",
  allowMultipleBarcodes: false,
};

export default function SetupScreen(): React.JSX.Element {
  const { app, phase, locale, finishSetup, finishOwnerSetup, errorText } =
    useApp();
  const [profile, setProfile] = useState(initialProfile);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const submit = async () => {
    setError(null);
    if (!app) return;
    if (password !== confirmation) {
      setError(
        new AppError("VALIDATION", "Passwords do not match.", "password"),
      );
      return;
    }
    setSaving(true);
    try {
      if (phase === "owner") {
        const user = await app.completeOwnerSetup({
          email,
          displayName: ownerName,
          password,
        });
        finishOwnerSetup(user);
      } else {
        const user = await app.setupBusiness(profile, {
          email,
          displayName: ownerName,
          password,
        });
        finishSetup(user);
      }
      router.replace("/(app)");
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Card>
          <Heading subtitle={t("setupIntro")}>{t("setupTitle")}</Heading>
          {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
          {phase !== "owner" ? (
            <View style={{ gap: spacing.md }}>
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                {t("businessDetails")}
              </Text>
              <BusinessProfileFields
                value={profile}
                onChange={setProfile}
                label={t}
              />
            </View>
          ) : null}
          <View style={{ gap: spacing.md }}>
            <Text
              style={{ color: colors.primary, fontSize: 18, fontWeight: "700" }}
            >
              {t("ownerDetails")}
            </Text>
            <Field
              label={t("ownerName")}
              value={ownerName}
              onChangeText={setOwnerName}
            />
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
            <Field
              label={t("confirmPassword")}
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
            />
          </View>
          <Button disabled={saving} onPress={() => void submit()}>
            {saving
              ? t("loading")
              : t(phase === "owner" ? "finishSetup" : "continueSetup")}
          </Button>
        </Card>
      </KeyboardAvoidingView>
    </Page>
  );
}
