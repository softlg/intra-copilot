-- Disabled Skills migrated during V32 received an immutable version 1 and
-- published_version = 1, but that version was incorrectly marked as a draft.
-- They can be enabled from the console, so the version backing the published
-- pointer must be executable by the runtime.
UPDATE skill_definition_version version
SET status = 'PUBLISHED'
FROM skill_definition skill
WHERE version.skill_id = skill.id
  AND version.version = skill.published_version
  AND version.status = 'DRAFT'
  AND version.created_by = 'migration'
  AND skill.published_version > 0;
