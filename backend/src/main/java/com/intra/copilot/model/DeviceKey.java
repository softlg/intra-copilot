package com.intra.copilot.model;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;

@TableName("device_key")
public class DeviceKey {
    @TableId private String deviceId;
    /** JWK 格式的 RSA 公钥，序列化为 JSON 字符串。 */
    private String publicKeyJwk;
    private String source;
    private String userId;
    private Boolean enabled = Boolean.TRUE;
    private Instant createdAt = Instant.now();
    private Instant lastSeenAt = Instant.now();

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String v) { deviceId = v; }

    public String getPublicKeyJwk() { return publicKeyJwk; }
    public void setPublicKeyJwk(String v) { publicKeyJwk = v; }

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
