package com.intra.copilot.repo;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.intra.copilot.model.DeviceRegistrationChallenge;
import java.time.Instant;
import java.util.Optional;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DeviceRegistrationChallengeRepository
        extends BaseMapper<DeviceRegistrationChallenge> {

    default Optional<DeviceRegistrationChallenge> findById(String id) {
        return Optional.ofNullable(selectById(id));
    }

    default boolean consume(String challengeId, Instant consumedAt) {
        return update(
                        null,
                        Wrappers.<DeviceRegistrationChallenge>lambdaUpdate()
                                .eq(DeviceRegistrationChallenge::getChallengeId, challengeId)
                                .isNull(DeviceRegistrationChallenge::getConsumedAt)
                                .set(DeviceRegistrationChallenge::getConsumedAt, consumedAt))
                == 1;
    }

    default int deleteExpired(Instant cutoff) {
        return delete(Wrappers.<DeviceRegistrationChallenge>query().lt("expires_at", cutoff));
    }
}
