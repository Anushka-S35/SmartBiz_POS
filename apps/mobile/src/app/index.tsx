import React from "react";
import { Redirect } from "expo-router";
import { Busy, Button, ErrorBanner, Page } from "../components/ui";
import { useApp } from "../context/app-context";
import { translate } from "@smartbiz/core";

export default function EntryScreen(): React.JSX.Element {
  const { status, phase, locale, startupError, reloadStartup, errorText } =
    useApp();
  if (status === "loading")
    return <Busy label={translate(locale, "loading")} />;
  if (status === "error") {
    return (
      <Page>
        <ErrorBanner>{translate(locale, errorText(startupError))}</ErrorBanner>
        <Button onPress={() => void reloadStartup()}>
          {translate(locale, "retry")}
        </Button>
      </Page>
    );
  }
  if (phase === "setup" || phase === "owner") return <Redirect href="/setup" />;
  if (phase === "signIn") return <Redirect href="/sign-in" />;
  return <Redirect href="/(app)" />;
}
