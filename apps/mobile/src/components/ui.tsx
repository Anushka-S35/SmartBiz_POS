import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii, spacing } from "../theme";

export function Page({ children }: React.PropsWithChildren): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Heading({
  children,
  subtitle,
}: React.PropsWithChildren<{ subtitle?: string }>): React.JSX.Element {
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children }: React.PropsWithChildren): React.JSX.Element {
  return <View style={styles.card}>{children}</View>;
}

interface ButtonProps extends React.PropsWithChildren {
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  accessibilityLabel?: string;
}

export function Button({
  children,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  accessibilityLabel,
}: ButtonProps): React.JSX.Element {
  const backgroundColor = danger
    ? colors.danger
    : secondary
      ? colors.chip
      : colors.primary;
  const textColor = secondary ? colors.ink : colors.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: disabled ? 0.48 : pressed ? 0.82 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: textColor }]}>{children}</Text>
    </Pressable>
  );
}

interface InputProps {
  label: string;
  value: string;
  onChangeText(value: string): void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  accessibilityHint?: string;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  multiline,
  autoCapitalize = "sentences",
  editable = true,
  accessibilityHint,
}: InputProps): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        editable={editable}
        placeholderTextColor={colors.muted}
        selectionColor={colors.focus}
        style={[
          styles.input,
          multiline && styles.multiline,
          !editable && styles.disabledInput,
        ]}
      />
    </View>
  );
}

export function Choice({
  options,
  selected,
  onSelect,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string;
  onSelect(value: string): void;
}): React.JSX.Element {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === option.value }}
          key={option.value}
          onPress={() => onSelect(option.value)}
          style={[
            styles.choice,
            selected === option.value && styles.choiceSelected,
          ]}
        >
          <Text
            style={[
              styles.choiceText,
              selected === option.value && styles.choiceTextSelected,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ErrorBanner({
  children,
}: React.PropsWithChildren): React.JSX.Element {
  return (
    <View accessibilityRole="alert" style={styles.errorBanner}>
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

export function Busy({ label }: { label: string }): React.JSX.Element {
  return (
    <View accessibilityRole="progressbar" style={styles.busy}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.subtitle}>{label}</Text>
    </View>
  );
}

export function Body({
  children,
  muted = false,
}: React.PropsWithChildren<{ muted?: boolean }>): React.JSX.Element {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, padding: spacing.lg, alignItems: "center" },
  content: {
    width: "100%",
    maxWidth: 1440,
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  heading: { gap: spacing.xs, paddingVertical: spacing.sm },
  title: { color: colors.deepNavy, fontSize: 26, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  button: {
    alignItems: "center",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  buttonText: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  field: { gap: spacing.xs, width: "100%" },
  label: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  disabledInput: { backgroundColor: colors.background },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  choiceSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceText: { color: colors.ink, fontSize: 14 },
  choiceTextSelected: { color: colors.surface, fontWeight: "700" },
  errorBanner: {
    backgroundColor: colors.dangerBackground,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  busy: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
  },
  body: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.muted },
});
