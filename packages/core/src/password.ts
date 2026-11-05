import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { AppError } from "./errors";

export const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;

export interface PasswordHash {
  hash: string;
  salt: string;
  iterations: number;
}

export async function hashPassword(
  password: string,
  randomBytes: (length: number) => Uint8Array,
): Promise<PasswordHash> {
  if (password.length < 12 || password.length > 128) {
    throw new AppError(
      "VALIDATION",
      "Password must be between 12 and 128 characters.",
      "password",
    );
  }
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  if (salt.length !== PASSWORD_SALT_BYTES) {
    throw new AppError(
      "PERSISTENCE",
      "Secure random number generation is unavailable.",
    );
  }
  const derived = await pbkdf2Async(sha256, password, salt, {
    c: PASSWORD_ITERATIONS,
    dkLen: PASSWORD_HASH_BYTES,
    asyncTick: 100,
  });
  return {
    hash: bytesToHex(derived),
    salt: bytesToHex(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  saltHex: string,
  iterations: number,
): Promise<boolean> {
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = hexToBytes(saltHex);
    expected = hexToBytes(expectedHash);
  } catch {
    return false;
  }
  if (
    salt.length !== PASSWORD_SALT_BYTES ||
    expected.length !== PASSWORD_HASH_BYTES ||
    iterations < 100_000
  ) {
    return false;
  }

  const actual = await pbkdf2Async(sha256, password, salt, {
    c: iterations,
    dkLen: PASSWORD_HASH_BYTES,
    asyncTick: 100,
  });
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (expected[index] ?? 0) ^ (actual[index] ?? 0);
  }
  return difference === 0;
}
