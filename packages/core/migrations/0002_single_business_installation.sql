CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_single_installation
ON businesses ((1));

PRAGMA user_version = 2;
