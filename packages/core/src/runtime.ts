import { AppError } from "./errors";
import type { Runtime } from "./models";

export function createRuntime(
  createId: () => string,
  randomBytes: (length: number) => Uint8Array,
  now: () => string = () => new Date().toISOString(),
): Runtime {
  return {
    now,
    createId: () => {
      const id = createId();
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        )
      ) {
        throw new AppError(
          "PERSISTENCE",
          "Secure ID generation is unavailable.",
        );
      }
      return id;
    },
    randomBytes,
  };
}
