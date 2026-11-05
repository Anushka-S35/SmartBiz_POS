import * as Crypto from "expo-crypto";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AppError,
  SmartBizApplication,
  createLogger,
  createRuntime,
  type Locale,
  type TranslationKey,
  type UserRecord,
} from "@smartbiz/core";
import { runtimeConfig } from "../config";
import { openApplicationDatabase } from "../database";

type AppStatus = "loading" | "ready" | "error";
type AppPhase = "setup" | "owner" | "signIn" | "app";

interface AppContextValue {
  status: AppStatus;
  phase: AppPhase;
  app: SmartBizApplication | null;
  user: UserRecord | null;
  locale: Locale;
  startupError: unknown;
  signIn(email: string, password: string): Promise<void>;
  finishSetup(user: UserRecord): void;
  finishOwnerSetup(user: UserRecord): void;
  signOut(): void;
  setLocale(locale: Locale): Promise<void>;
  reloadStartup(): Promise<void>;
  errorText(error: unknown): TranslationKey;
}

const AppContext = createContext<AppContextValue | null>(null);
const logger = createLogger();

export function AppProvider({
  children,
}: React.PropsWithChildren): React.JSX.Element {
  const [status, setStatus] = useState<AppStatus>("loading");
  const [phase, setPhase] = useState<AppPhase>("setup");
  const [app, setApp] = useState<SmartBizApplication | null>(null);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [locale, setLocaleState] = useState<Locale>("en");
  const [startupError, setStartupError] = useState<unknown>(null);

  const errorText = useCallback((error: unknown): TranslationKey => {
    if (!(error instanceof AppError)) return "errorUnexpected";
    switch (error.code) {
      case "VALIDATION":
        return "errorValidation";
      case "UNAUTHENTICATED":
        return "errorUnauthenticated";
      case "FORBIDDEN":
        return "errorForbidden";
      case "NOT_FOUND":
        return "errorNotFound";
      case "CONFLICT":
        if (
          error instanceof AppError &&
          error.field === "stock.negative_stock"
        ) {
          return "errorInsufficientStock";
        }
        return "errorConflict";
      case "SETUP_INCOMPLETE":
        return "errorSetup";
      case "UNSUPPORTED_PLATFORM":
        return "errorUnsupportedPlatform";
      case "PERSISTENCE":
        return "errorPersistence";
    }
  }, []);

  const reloadStartup = useCallback(async () => {
    setStatus("loading");
    setStartupError(null);
    try {
      const database = await openApplicationDatabase();
      const application = new SmartBizApplication(
        database,
        createRuntime(Crypto.randomUUID, Crypto.getRandomBytes),
        runtimeConfig.sessionTtlMinutes,
      );
      const [setupState, savedLocale] = await Promise.all([
        application.getSetupState(),
        application.getLocale(),
      ]);
      setApp(application);
      setLocaleState(savedLocale);
      setPhase(
        setupState.setupComplete
          ? "signIn"
          : setupState.businessExists
            ? "owner"
            : "setup",
      );
      setStatus("ready");
    } catch (error) {
      logger.error("application.startup_failed", Crypto.randomUUID(), error);
      setStartupError(error);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void reloadStartup();
  }, [reloadStartup]);

  useEffect(() => {
    if (!user || !expiresAt) return undefined;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) {
      app?.logout();
      setUser(null);
      setExpiresAt(null);
      setPhase("signIn");
      return undefined;
    }
    const timer = setTimeout(() => {
      app?.logout();
      setUser(null);
      setExpiresAt(null);
      setPhase("signIn");
    }, remaining);
    return () => clearTimeout(timer);
  }, [app, user, expiresAt]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!app)
        throw new AppError(
          "PERSISTENCE",
          "Application services are not ready.",
        );
      const session = await app.login(email, password);
      setUser(session.user);
      setExpiresAt(session.expiresAt);
      setPhase("app");
    },
    [app],
  );

  const finishSetup = useCallback((createdUser: UserRecord) => {
    setUser(createdUser);
    setExpiresAt(
      new Date(
        Date.now() + runtimeConfig.sessionTtlMinutes * 60_000,
      ).toISOString(),
    );
    setPhase("app");
  }, []);

  const finishOwnerSetup = useCallback((createdUser: UserRecord) => {
    setUser(createdUser);
    setExpiresAt(
      new Date(
        Date.now() + runtimeConfig.sessionTtlMinutes * 60_000,
      ).toISOString(),
    );
    setPhase("app");
  }, []);

  const signOut = useCallback(() => {
    app?.logout();
    setUser(null);
    setExpiresAt(null);
    setPhase("signIn");
  }, [app]);

  const setLocale = useCallback(
    async (nextLocale: Locale) => {
      if (!app)
        throw new AppError(
          "PERSISTENCE",
          "Application services are not ready.",
        );
      await app.setLocale(nextLocale);
      setLocaleState(nextLocale);
    },
    [app],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      phase,
      app,
      user,
      locale,
      startupError,
      signIn,
      finishSetup,
      finishOwnerSetup,
      signOut,
      setLocale,
      reloadStartup,
      errorText,
    }),
    [
      status,
      phase,
      app,
      user,
      locale,
      startupError,
      signIn,
      finishSetup,
      finishOwnerSetup,
      signOut,
      setLocale,
      reloadStartup,
      errorText,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used within AppProvider.");
  return value;
}
