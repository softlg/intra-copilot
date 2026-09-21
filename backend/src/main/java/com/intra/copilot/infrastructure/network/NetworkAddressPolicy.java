package com.intra.copilot.infrastructure.network;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Shared SSRF policy used when DNS is resolved and immediately before connecting. */
@Component
public class NetworkAddressPolicy {
    private final boolean allowPrivateNetwork;

    public NetworkAddressPolicy(
            @Value("${tools.allow-private-network:false}") boolean allowPrivateNetwork) {
        this.allowPrivateNetwork = allowPrivateNetwork;
    }

    public InetAddress[] resolveAndValidate(String host) throws UnknownHostException {
        InetAddress[] addresses = InetAddress.getAllByName(host);
        if (addresses.length == 0) throw new UnknownHostException(host);
        for (InetAddress address : addresses) {
            validate(address);
        }
        return addresses;
    }

    public void validate(InetAddress address) throws UnknownHostException {
        if (address == null) throw new UnknownHostException("empty address");
        if (isCloudMetadata(address.getHostAddress())) {
            throw new UnknownHostException("cloud metadata address is forbidden");
        }
        if (!allowPrivateNetwork && isPrivate(address)) {
            throw new UnknownHostException("private network address is forbidden");
        }
    }

    public boolean isPrivate(InetAddress address) {
        return address.isAnyLocalAddress()
                || address.isLoopbackAddress()
                || address.isLinkLocalAddress()
                || address.isSiteLocalAddress()
                || address.isMulticastAddress()
                || isUniqueLocalIpv6(address.getHostAddress());
    }

    public boolean isCloudMetadata(String host) {
        String normalized =
                host == null ? "" : host.toLowerCase(Locale.ROOT).replace("[", "").replace("]", "");
        return normalized.equals("169.254.169.254")
                || normalized.equals("metadata.google.internal")
                || normalized.equals("metadata.google.com");
    }

    private static boolean isUniqueLocalIpv6(String address) {
        String normalized = address == null ? "" : address.toLowerCase(Locale.ROOT);
        return normalized.startsWith("fc") || normalized.startsWith("fd");
    }
}
