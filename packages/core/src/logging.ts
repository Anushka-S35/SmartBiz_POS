import type { AppError } from "./errors";

export interface SafeLogEvent {
  level: "info" | "warn" | "error";
  event: string;
  correlationId: string;
  errorCode?: string;
}

export function createLogger(
  write: (event: SafeLogEvent) => void = (event) => console[event.level](event),
): {
  info(event: string, correlationId: string): void;
  warn(event: string, correlationId: string): void;
  error(event: string, correlationId: string, error: unknown): void;
} {
  return {
    info: (event, correlationId) =>
      write({ level: "info", event, correlationId }),
    warn: (event, correlationId) =>
      write({ level: "warn", event, correlationId }),
    error: (event, correlationId, error) => {
      const errorCode = isAppError(error) ? error.code : "UNEXPECTED";
      write({ level: "error", event, correlationId, errorCode });
    },
  };
}

function isAppError(error: unknown): error is AppError {
  return typeof error === "object" && error !== null && "code" in error;
}
