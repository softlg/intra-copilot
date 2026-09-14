-- Skills become versioned, scoped, testable capabilities rather than mutable
-- prompt rows. Legacy JSON columns remain for backward compatibility while all
-- new writes are mirrored into relational binding tables.

ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS activation_mode VARCHAR(16) NOT NULL DEFAULT 'ALWAYS';
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS activation_config TEXT NOT NULL DEFAULT '{}';
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS max_prompt_chars INTEGER NOT NULL DEFAULT 8000;
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS published_version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS invocation_count BIGINT NOT NULL DEFAULT 0;
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS lock_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE skill_definition
  ADD COLUMN IF NOT EXISTS updated_by VARCHAR(160);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(TRIM(name))
           ORDER BY created_at, id
         ) AS row_number
  FROM skill_definition
)
UPDATE skill_definition definition
SET name = definition.name || ' (' || ranked.row_number || ')'
FROM ranked
WHERE definition.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_skill_definition_normalized_name
  ON skill_definition(LOWER(TRIM(name)));
CREATE INDEX IF NOT EXISTS idx_skill_definition_status_priority
  ON skill_definition(status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS skill_tool_binding (
  id VARCHAR(64) PRIMARY KEY,
  skill_id VARCHAR(64) NOT NULL REFERENCES skill_definition(id) ON DELETE CASCADE,
  tool_id VARCHAR(64) NOT NULL REFERENCES tool_definition(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_skill_tool_binding
  ON skill_tool_binding(skill_id, tool_id);
CREATE INDEX IF NOT EXISTS idx_skill_tool_binding_tool
  ON skill_tool_binding(tool_id);

INSERT INTO skill_tool_binding (id, skill_id, tool_id, created_at)
SELECT 'ST' || SUBSTRING(MD5(skill.id || ':' || tool_id), 1, 11),
       skill.id,
       tool_id,
       COALESCE(skill.created_at, NOW())
FROM skill_definition skill
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(NULLIF(skill.tool_ids, ''), '[]')::jsonb
) AS tool_id
WHERE tool_id <> ''
ON CONFLICT (skill_id, tool_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS agent_skill_binding (
  id VARCHAR(64) PRIMARY KEY,
  agent_id VARCHAR(128) NOT NULL REFERENCES agent_definition(id) ON DELETE CASCADE,
  skill_id VARCHAR(64) NOT NULL REFERENCES skill_definition(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_skill_binding_agent
  ON agent_skill_binding(agent_id, priority);
CREATE INDEX IF NOT EXISTS idx_agent_skill_binding_skill
  ON agent_skill_binding(skill_id);

INSERT INTO agent_skill_binding (
  id, agent_id, skill_id, priority, enabled, created_at, updated_at
)
SELECT 'AS' || SUBSTRING(MD5(agent.id || ':' || skill_id), 1, 11),
       agent.id,
       skill_id,
       100,
       TRUE,
       COALESCE(agent.created_at, NOW()),
       COALESCE(agent.updated_at, NOW())
FROM agent_definition agent
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(NULLIF(agent.skill_ids, ''), '[]')::jsonb
) AS skill_id
WHERE skill_id <> ''
ON CONFLICT (agent_id, skill_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS skill_definition_version (
  id VARCHAR(64) PRIMARY KEY,
  skill_id VARCHAR(64) NOT NULL REFERENCES skill_definition(id) ON DELETE CASCADE,
  version BIGINT NOT NULL,
  version_label VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  prompt TEXT NOT NULL,
  tool_ids TEXT NOT NULL DEFAULT '[]',
  snapshot TEXT NOT NULL,
  change_note TEXT,
  created_by VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(skill_id, version)
);

CREATE INDEX IF NOT EXISTS idx_skill_definition_version_created
  ON skill_definition_version(skill_id, version DESC);

INSERT INTO skill_definition_version (
  id, skill_id, version, version_label, status, prompt, tool_ids, snapshot,
  change_note, created_by, created_at
)
SELECT 'SV' || SUBSTRING(MD5(skill.id || ':1'), 1, 11),
       skill.id,
       1,
       COALESCE(NULLIF(skill.version, ''), '1.0.0'),
       CASE WHEN skill.enabled THEN 'PUBLISHED' ELSE 'DRAFT' END,
       skill.prompt,
       COALESCE(skill.tool_ids, '[]'),
       json_build_object(
         'id', skill.id,
         'name', skill.name,
         'description', skill.description,
         'prompt', skill.prompt,
         'toolIds', COALESCE(NULLIF(skill.tool_ids, ''), '[]'),
         'version', COALESCE(NULLIF(skill.version, ''), '1.0.0'),
         'enabled', skill.enabled
       )::text,
       '迁移现有 Skill',
       'migration',
       COALESCE(skill.updated_at, skill.created_at, NOW())
FROM skill_definition skill
ON CONFLICT (skill_id, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS skill_audit_log (
  id VARCHAR(64) PRIMARY KEY,
  skill_id VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  actor VARCHAR(160),
  before_config TEXT,
  after_config TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_audit_log_created
  ON skill_audit_log(skill_id, created_at DESC);

ALTER TABLE agent_invocation
  ADD COLUMN IF NOT EXISTS skill_context TEXT;
