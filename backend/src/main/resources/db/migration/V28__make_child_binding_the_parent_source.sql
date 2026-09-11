WITH ranked AS (
  SELECT binding.id,
         ROW_NUMBER() OVER (
           PARTITION BY binding.child_agent_id
           ORDER BY
             CASE
               WHEN binding.parent_agent_id = child.parent_agent_id THEN 0
               ELSE 1
             END,
             binding.created_at,
             binding.id
         ) AS row_number
  FROM agent_child_binding binding
  JOIN agent_definition child ON child.id = binding.child_agent_id
)
DELETE FROM agent_child_binding
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

-- Keep the legacy parent value when it exists, then make the binding table the
-- single source of truth for the domain/sub-agent relationship.
UPDATE agent_child_binding binding
SET parent_agent_id = child.parent_agent_id,
    priority = 100,
    routing_rule = NULL,
    updated_at = NOW()
FROM agent_definition child
JOIN agent_definition parent ON parent.id = child.parent_agent_id
WHERE binding.child_agent_id = child.id
  AND child.role = 'SUB'
  AND parent.role = 'DOMAIN';

CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_child_binding_child
  ON agent_child_binding(child_agent_id);

INSERT INTO agent_child_binding (
  id,
  parent_agent_id,
  child_agent_id,
  priority,
  routing_rule,
  enabled,
  created_at,
  updated_at
)
SELECT
  'AB' || SUBSTRING(MD5(child.id), 1, 11),
  child.parent_agent_id,
  child.id,
  100,
  NULL,
  TRUE,
  NOW(),
  NOW()
FROM agent_definition child
JOIN agent_definition parent ON parent.id = child.parent_agent_id
WHERE child.role = 'SUB'
  AND parent.role = 'DOMAIN'
ON CONFLICT (child_agent_id) DO NOTHING;

ALTER TABLE agent_definition DROP COLUMN IF EXISTS parent_agent_id;
