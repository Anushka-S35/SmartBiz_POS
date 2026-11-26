import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import {
  translate,
  type BusinessProfile,
  type BusinessProfileInput,
} from "@smartbiz/core";
import { BusinessProfileFields } from "../../components/business-profile-fields";
import {
  Body,
  Button,
  Card,
  Choice,
  ErrorBanner,
  Heading,
  Page,
} from "../../components/ui";
import { useApp } from "../../context/app-context";
import { spacing } from "../../theme";

function toInput(profile: BusinessProfile): BusinessProfileInput {
  return {
    legalName: profile.legalName,
    displayName: profile.displayName,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
    logoUri: profile.logoUri ?? "",
    currencyCode: profile.currencyCode,
    timezone: profile.timezone,
    invoicePrefix: profile.invoicePrefix,
    taxEnabled: profile.taxEnabled,
    taxRegistrationId: profile.taxRegistrationId ?? "",
    gstRegistrationType: profile.gstRegistrationType,
    gstTradeName: profile.gstTradeName,
    gstStateCode: profile.gstStateCode,
    gstRegisteredAddress: profile.gstRegisteredAddress,
    gstFinancialYearStartMonth: profile.gstFinancialYearStartMonth,
    gstInvoicePrefix: profile.gstInvoicePrefix,
    gstInvoiceFooter: profile.gstInvoiceFooter,
    allowMultipleBarcodes: profile.allowMultipleBarcodes,
  };
}

export default function SettingsScreen(): React.JSX.Element {
  const { app, user, locale, setLocale, signOut, errorText } = useApp();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [profile, setProfile] = useState<BusinessProfileInput | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!app || !user || user.role !== "ADMIN") return;
    try {
      setProfile(toInput(await app.getBusiness(user.id)));
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [app, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!app || !user || !profile) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await app.updateBusiness(user.id, profile);
      setProfile(toInput(updated));
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <Heading>{t("settings")}</Heading>
      {error ? <ErrorBanner>{t(errorText(error))}</ErrorBanner> : null}
      <Card>
        <Heading>{t("locale")}</Heading>
        <Choice
          selected={locale}
          onSelect={(value) => {
            if (value === "en" || value === "hi" || value === "mr") {
              void setLocale(value).catch((caught: unknown) =>
                setError(caught),
              );
            }
          }}
          options={[
            { value: "en", label: t("english") },
            { value: "hi", label: t("hindi") },
            { value: "mr", label: t("marathi") },
          ]}
        />
      </Card>
      {user?.role === "ADMIN" ? (
        <Card>
          <Heading>{t("businessProfile")}</Heading>
          {profile ? (
            <BusinessProfileFields
              value={profile}
              onChange={setProfile}
              label={t}
            />
          ) : (
            <Body>{t("loading")}</Body>
          )}
          {saved ? <Body>{t("profileSaved")}</Body> : null}
          <Button disabled={!profile || saving} onPress={() => void save()}>
            {t("save")}
          </Button>
        </Card>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          marginTop: spacing.sm,
        }}
      >
        <Button danger onPress={signOut}>
          {t("signOut")}
        </Button>
      </View>
    </Page>
  );
}
