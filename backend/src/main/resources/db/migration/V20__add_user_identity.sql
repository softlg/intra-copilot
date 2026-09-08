-- 为会话和消息引入「宿主 + 用户」归属，支持多宿主隔离
-- 历史数据统一归 source=extension, user_id=anonymous

ALTER TABLE conversation
  ADD COLUMN source VARCHAR(64) NOT NULL DEFAULT 'extension',
  ADD COLUMN user_id VARCHAR(128) NOT NULL DEFAULT 'anonymous';

CREATE INDEX idx_conversation_user
  ON conversation (source, user_id, updated_at DESC);

-- 设备公钥表：存插件自签 JWT 的 RSA 公钥
CREATE TABLE IF NOT EXISTS device_key (
  device_id      VARCHAR(64)  PRIMARY KEY,
  public_key_jwk JSON         NOT NULL,
  source         VARCHAR(64)  NOT NULL,
  user_id        VARCHAR(128) NOT NULL,
  enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
