# Security baseline and threat model

## Scope and limitations

The current application is local-first and has no API or synchronization service. Authorization is enforced by application use cases, not only by hidden UI controls. This protects normal application workflows but cannot resist a modified client or a person with direct access to an unencrypted local database. Do not use this build as a hosted or multi-device security solution.

## Threats and controls

| Threat                            | Current control                                                                                                      | Remaining risk                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Unauthorized staff member         | Password sign-in, salted password hashes, role checks bound to a live in-memory service session, disable-user checks | Local DB modification bypasses app-level controls; each local app process has one active session |
| Credential exposure               | PBKDF2-SHA-256 salted hashes; passwords/tokens excluded from logs; memory-only sessions                              | Local DB extraction exposes hashes to offline guessing                                           |
| Session theft                     | No persisted bearer token; service-validated expiring in-memory session; logout clears service and app state         | Device compromise while unlocked; no session refresh tokens                                      |
| Malformed input                   | Zod/application-boundary validation and SQL parameter binding                                                        | Must be extended to every future API boundary                                                    |
| Sensitive logs                    | Structured event/error logging avoids user-supplied values                                                           | Device-level log collection remains platform-dependent                                           |
| Dependency compromise             | Lockfile and CI `npm audit` reporting                                                                                | Known high and moderate npm advisories remain; no formal security audit or signing pipeline      |
| Device loss / database extraction | Platform sandboxing                                                                                                  | Database encryption and managed backup are not implemented                                       |

## Requirements before production or cloud use

- Add platform-secure key storage and database encryption, document key recovery.
- Add TLS API, server-side default-deny authorization, rate limiting, secure refresh/revocation, and audit delivery.
- Define trusted-device enrollment, offline authentication expiry, sync conflict handling and backup retention.
- Add dependency/secret scanning and a threat review to CI/release.
- Define privacy retention/export/delete policies before collecting customer PII.

## Current dependency audit

The lockfile was checked with `npm audit` on 2026-11-04. It reports 42 advisories across the complete dependency graph: 5 high, 36 moderate, and 1 low. The production dependency audit (`npm audit --omit=dev`) still reports 31 advisories, including all 5 high and 25 moderate findings. Zod was upgraded to a patched major version. Other findings include Expo SDK 54 / Expo Router 6 toolchain advisories and transitive image parsing. The npm audit remediation suggestions require major Expo/Router/React Native upgrades for some findings; those upgrades were not applied without validating the native compatibility matrix. CI now fails on high or critical advisories. The current dependency tree therefore makes the CI security gate fail, and high runtime findings remain production blockers.

Never store payment PAN/CVV. Barcode values are identifiers and are never trusted for price or stock.
