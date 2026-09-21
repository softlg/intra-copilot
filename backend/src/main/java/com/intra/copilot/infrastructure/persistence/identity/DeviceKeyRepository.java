package com.intra.copilot.infrastructure.persistence.identity;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.intra.copilot.domain.identity.DeviceKey;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface DeviceKeyRepository extends BaseMapper<DeviceKey> {
    default DeviceKey save(DeviceKey value) {
        if (selectById(value.getDeviceId()) == null) insert(value);
        else updateById(value);
        return value;
    }
}
