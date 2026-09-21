package com.intra.copilot.domain.identity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.intra.copilot.shared.util.EntityIdGenerator;
import java.time.Instant;

@TableName("device_registration_challenge")
public class DeviceRegistrationChallenge {
    @TableId private String challengeId = EntityIdGenerator.next("DC");
    private String deviceId;
    private String source;
    private String nonce;
    private String purpose = "REGISTER";
    private Instant expiresAt;
    private Instant consumedAt;
    private Instant createdAt = Instant.now();

    public String getChallengeId() {
        return challengeId;
    }

    public void setChallengeId(String value) {
        challengeId = value;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String value) {
        deviceId = value;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String value) {
        source = value;
    }

    public String getNonce() {
        return nonce;
    }

    public void setNonce(String value) {
        nonce = value;
    }

    public String getPurpose() {
        return purpose;
    }

    public void setPurpose(String value) {
        purpose = value;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant value) {
        expiresAt = value;
    }

    public Instant getConsumedAt() {
        return consumedAt;
    }

    public void setConsumedAt(Instant value) {
        consumedAt = value;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant value) {
        createdAt = value;
    }
}
