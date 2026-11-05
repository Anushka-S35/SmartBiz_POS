import React from "react";
import { Switch, Text, View } from "react-native";
import type { BusinessProfileInput, TranslationKey } from "@smartbiz/core";
import { Field } from "./ui";
import { colors, spacing } from "../theme";

export function BusinessProfileFields({
  value,
  onChange,
  label,
}: {
  value: BusinessProfileInput;
  onChange(value: BusinessProfileInput): void;
  label(key: TranslationKey): string;
}): React.JSX.Element {
  const update = <K extends keyof BusinessProfileInput>(
    key: K,
    nextValue: BusinessProfileInput[K],
  ) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <View style={{ gap: spacing.md }}>
      <Field
        label={label("legalName")}
        value={value.legalName}
        onChangeText={(text) => update("legalName", text)}
      />
      <Field
        label={label("displayName")}
        value={value.displayName}
        onChangeText={(text) => update("displayName", text)}
      />
      <Field
        label={label("address")}
        value={value.address}
        onChangeText={(text) => update("address", text)}
        multiline
      />
      <Field
        label={label("phone")}
        value={value.phone}
        onChangeText={(text) => update("phone", text)}
        keyboardType="phone-pad"
      />
      <Field
        label={label("email")}
        value={value.email}
        onChangeText={(text) => update("email", text)}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Field
        label={label("logoUri")}
        value={value.logoUri}
        onChangeText={(text) => update("logoUri", text)}
        autoCapitalize="none"
      />
      <Field
        label={label("currencyCode")}
        value={value.currencyCode}
        onChangeText={(text) => update("currencyCode", text.toUpperCase())}
        autoCapitalize="characters"
      />
      <Field
        label={label("timezone")}
        value={value.timezone}
        onChangeText={(text) => update("timezone", text)}
        autoCapitalize="none"
      />
      <Field
        label={label("invoicePrefix")}
        value={value.invoicePrefix}
        onChangeText={(text) => update("invoicePrefix", text)}
        autoCapitalize="characters"
      />
      <ToggleRow
        label={`${label("taxMode")}: ${label(value.taxEnabled ? "taxEnabled" : "taxDisabled")}`}
        value={value.taxEnabled}
        onValueChange={(enabled) => update("taxEnabled", enabled)}
      />
      {value.taxEnabled ? (
        <Field
          label={label("taxRegistrationId")}
          value={value.taxRegistrationId}
          onChangeText={(text) => update("taxRegistrationId", text)}
          autoCapitalize="characters"
        />
      ) : null}
      <ToggleRow
        label={label("multipleBarcodes")}
        value={value.allowMultipleBarcodes}
        onValueChange={(enabled) => update("allowMultipleBarcodes", enabled)}
      />
    </View>
  );
}

export function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange(value: boolean): void;
}): React.JSX.Element {
  return (
    <View
      style={{
        alignItems: "center",
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: spacing.md,
        justifyContent: "space-between",
        minHeight: 52,
        paddingHorizontal: spacing.md,
      }}
    >
      <Text
        style={{ color: colors.ink, flex: 1, fontSize: 14, fontWeight: "600" }}
      >
        {label}
      </Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
      />
    </View>
  );
}
