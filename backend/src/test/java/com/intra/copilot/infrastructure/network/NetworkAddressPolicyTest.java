package com.intra.copilot.infrastructure.network;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.InetAddress;
import java.net.UnknownHostException;
import org.junit.jupiter.api.Test;

class NetworkAddressPolicyTest {

    @Test
    void rejectsLoopbackWhenPrivateNetworkIsDisabled() throws Exception {
        NetworkAddressPolicy policy = new NetworkAddressPolicy(false);

        assertThrows(
                UnknownHostException.class,
                () -> policy.validate(InetAddress.getLoopbackAddress()));
    }

    @Test
    void allowsPrivateAddressesOnlyWhenExplicitlyEnabled() throws Exception {
        NetworkAddressPolicy allowPrivate = new NetworkAddressPolicy(true);

        assertFalse(allowPrivate.isCloudMetadata("127.0.0.1"));
        assertTrue(allowPrivate.isPrivate(InetAddress.getByName("127.0.0.1")));
        assertThrows(
                UnknownHostException.class,
                () -> allowPrivate.validate(InetAddress.getByName("169.254.169.254")));
    }
}
