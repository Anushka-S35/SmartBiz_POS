import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "../context/app-context";
import ErrorBoundary from "../components/error-boundary";

export default function RootLayout(): React.JSX.Element {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <Stack
          initialRouteName="index"
          screenOptions={{ headerShown: false, animation: "fade" }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="(app)" />
        </Stack>
      </ErrorBoundary>
    </AppProvider>
  );
}
