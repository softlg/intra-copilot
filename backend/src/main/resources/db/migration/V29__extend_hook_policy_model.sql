-- Hook policies are versioned, scoped, and audited independently from the
-- legacy all-global pre-agent rule list.
ALTER TABLE hook_definition
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE hook_definition
  ADD COLUMN IF NOT EXISTS fail_mode VARCHAR(16) NOT NULL DEFAULT 'BLOCK';
ALTER TABLE hook_definition
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(160);

-- Existing installs may already contain duplicate names. Keep the oldest row
-- and suffix later duplicates so the unique index can be applied safely.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(name))
           ORDER BY created_at, id
         ) AS row_number
  FROM hook_definition
)
UPDATE hook_definition definition
SET name = definition.name || ' (' || ranked.row_number || ')'
FROM ranked
WHERE definition.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_hook_definition_normalized_name
  ON hook_definition(LOWER(TRIM(name)));

CREATE TABLE IF NOT EXISTS hook_binding (
  id VARCHAR(64) PRIMARY KEY,
  hook_id VARCHAR(64) NOT NULL REFERENCES hook_definition(id) ON DELETE CASCADE,
  target_type VARCHAR(32) NOT NULL,
  target_id VARCHAR(128) NOT NULL DEFAULT '*',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hook_binding_target
  ON hook_binding(hook_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_hook_binding_lookup
  ON hook_binding(target_type, target_id);

-- Existing hooks were global and were evaluated for both the route agent and
-- the final child agent. They become global PRE_ROUTE policies so the same
-- early blocking behavior is preserved without duplicate evaluation.
UPDATE hook_definition
SET phase = 'PRE_ROUTE',
    updated_at = NOW();

UPDATE hook_definition
SET phase = 'PRE_ROUTE',
    rule_type = 'REQUIRE_PAGE_CONSENT',
    rule_config = '{}',
    updated_at = NOW()
WHERE rule_type = 'REQUIRE_PERMISSION'
  AND rule_config LIKE '%"permission"%'
  AND rule_config LIKE '%readPage%';

INSERT INTO hook_binding (id, hook_id, target_type, target_id, created_at)
SELECT 'HB' || SUBSTRING(MD5(hook.id), 1, 11),
       hook.id,
       'GLOBAL',
       '*',
       NOW()
FROM hook_definition hook
ON CONFLICT (hook_id, target_type, target_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hook_definition_version (
  id VARCHAR(64) PRIMARY KEY,
  hook_id VARCHAR(64) NOT NULL,
  version BIGINT NOT NULL,
  snapshot TEXT NOT NULL,
  change_note TEXT,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hook_definition_version
  ON hook_definition_version(hook_id, version);
CREATE INDEX IF NOT EXISTS idx_hook_definition_version_created
  ON hook_definition_version(hook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hook_audit_log (
  id VARCHAR(64) PRIMARY KEY,
  hook_id VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  actor VARCHAR(160),
  before_config TEXT,
  after_config TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hook_audit_log_created
  ON hook_audit_log(hook_id, created_at DESC);
