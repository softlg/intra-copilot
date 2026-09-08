ALTER TABLE conversation ADD COLUMN IF NOT EXISTS sort_order BIGINT;

-- 初始化为按 updated_at 倒序的步长序列，让历史数据可排序且留出插入间隙。
-- 步长 1024，可在不重排的情况下多次插入。
UPDATE conversation c
SET sort_order = s.rn * 1024
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY updated_at DESC) AS rn
  FROM conversation
) s
WHERE c.id = s.id AND c.sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_sort_order ON conversation (sort_order);
