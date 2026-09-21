package com.intra.copilot.infrastructure.network;

import java.net.InetAddress;
import java.net.UnknownHostException;
import org.apache.hc.client5.http.DnsResolver;

/** Rejects private or metadata targets every time the HTTP client resolves a host. */
public final class SafeDnsResolver implements DnsResolver {
    private final NetworkAddressPolicy policy;

    public SafeDnsResolver(NetworkAddressPolicy policy) {
        this.policy = policy;
    }

    @Override
    public InetAddress[] resolve(String host) throws UnknownHostException {
        return policy.resolveAndValidate(host);
    }

    @Override
    public String resolveCanonicalHostname(String host) throws UnknownHostException {
        return resolve(host)[0].getCanonicalHostName();
    }
}
