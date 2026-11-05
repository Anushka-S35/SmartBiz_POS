# Contributing

## Development setup

Follow [Development setup](./docs/DEVELOPMENT_SETUP.md) to install the supported Node.js version and dependencies.

## Before opening a change

Run the relevant checks from the repository root:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Keep business rules in `packages/core`, validate inputs at service boundaries, and add tests for changed behavior. Database changes require a new ordered migration and migration tests; do not edit an already-released migration.

## Scope and security

Do not add real credentials, production data, or secrets. Do not log passwords, tokens, or user-supplied values. Changes to authentication, permissions, money representation, migration semantics, or barcode history require focused review and tests.

Keep implementation tracking current in `docs/IMPLEMENTATION_TRACKER.md`, including platform limitations and deferred acceptance criteria.
