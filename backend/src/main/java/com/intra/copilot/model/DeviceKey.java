package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.persistence.PostgresJsonNodeTypeHandler;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import org.apache.ibatis.type.JdbcType;

/**
 * 设备公钥表。
 *
 * <p>{@code publicKeyJwk} 是设备上传的 RSA 公钥 JWK；数据库列为 {@code json} 类型，
 * 借助 MyBatis-Plus 内置的 自定义 PostgreSQL JSON 类型处理器 在写入时自动把 {@link JsonNode}
 * 序列化为合法 JSON、读取时再反序列化回来。
 */
@TableName(value = "device_key", autoResultMap = true)
public class DeviceKey {

    @TableId private String deviceId;

    @TableField(typeHandler = PostgresJsonNodeTypeHandler.class, jdbcType = JdbcType.OTHER)
    private JsonNode publicKeyJwk;

    private String source;
    private String userId;
    private Boolean enabled = Boolean.TRUE;
    private Instant createdAt = Instant.now();
    private Instant lastSeenAt = Instant.now();

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String v) { deviceId = v; }

    public JsonNode getPublicKeyJwk() { return publicKeyJwk; }
    public void setPublicKeyJwk(JsonNode v) { publicKeyJwk = v; }

    public String getSource() { return source; }
    public void setSource(String v) { source = v; }

    public String getUserId() { return userId; }
    public void setUserId(String v) { userId = v; }

    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean v) { enabled = v; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant v) { createdAt = v; }

    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant v) { lastSeenAt = v; }

    public void touch() { lastSeenAt = Instant.now(); }
}