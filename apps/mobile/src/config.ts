import { AppError } from "@smartbiz/core";

const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const sessionTtlValue = process.env.EXPO_PUBLIC_SESSION_TTL_MINUTES ?? "30";
const sessionTtlMinutes = Number(sessionTtlValue);

if (!["development", "staging", "production"].includes(appEnvironment)) {
  throw new AppError(
    "VALIDATION",
    "EXPO_PUBLIC_APP_ENV must be development, staging, or production.",
  );
}
if (
  !Number.isInteger(sessionTtlMinutes) ||
  sessionTtlMinutes < 5 ||
  sessionTtlMinutes > 720
) {
  throw new AppError(
    "VALIDATION",
    "EXPO_PUBLIC_SESSION_TTL_MINUTES must be an integer from 5 to 720.",
  );
}

export const runtimeConfig = {
  appEnvironment,
  sessionTtlMinutes,
};
