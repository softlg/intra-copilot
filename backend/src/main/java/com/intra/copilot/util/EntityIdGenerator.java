package com.intra.copilot.util;

import java.lang.management.ManagementFactory;
import java.util.Arrays;

/**
 * Generates stable, module-prefixed entity IDs.
 *
 * <p>Each ID is exactly 13 characters: a two-character module code followed by an
 * eleven-character, zero-padded Base58 Snowflake value. The Snowflake layout is
 * 41 bits of timestamp, 5 bits of node ID, and 12 bits of per-millisecond sequence.
 *
 * <p>Set {@code APP_NODE_ID} (or {@code -Dapp.node-id}) to a unique value from 0 to
 * 31 for every backend instance. When omitted, a node number is derived from the
 * host and JVM identity so local instances do not all use the same value.
 */
public final class EntityIdGenerator {

  private static final String BASE58_ALPHABET =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  private static final int BASE = BASE58_ALPHABET.length();
  private static final int PADDED_LENGTH = 11;
  private static final long CUSTOM_EPOCH_MILLIS = 1_704_067_200_000L; // 2024-01-01T00:00:00Z
  private static final long MAX_TIMESTAMP = (1L << 41) - 1;
  private static final int NODE_BITS = 5;
  private static final int SEQUENCE_BITS = 12;
  private static final long SEQUENCE_MASK = (1L << SEQUENCE_BITS) - 1;
  private static final int NODE_ID = resolveNodeId();

  private static long lastTimestamp = -1L;
  private static long sequence = 0L;

  private EntityIdGenerator() {}

  /**
   * Creates a new ID for the supplied two-character module code.
   *
   * @param moduleCode module prefix, for example {@code AG} for agents
   * @return a 13-character ID
   */
  public static String next(String moduleCode) {
    if (moduleCode == null || !moduleCode.matches("[A-Z]{2}")) {
      throw new IllegalArgumentException("模块码必须是两个大写字母");
    }
    return moduleCode + encode(nextSnowflake());
  }

  private static synchronized long nextSnowflake() {
    long timestamp = currentTimestamp();
    if (timestamp < lastTimestamp) {
      // Keep IDs monotonic if the system clock moves backwards.
      timestamp = lastTimestamp;
    }
    if (timestamp == lastTimestamp) {
      sequence = (sequence + 1) & SEQUENCE_MASK;
      if (sequence == 0) {
        timestamp = waitNextMillis(lastTimestamp);
      }
    } else {
      sequence = 0;
    }
    lastTimestamp = timestamp;
    return (timestamp << (NODE_BITS + SEQUENCE_BITS)) | ((long) NODE_ID << SEQUENCE_BITS) | sequence;
  }

  private static long currentTimestamp() {
    long timestamp = System.currentTimeMillis() - CUSTOM_EPOCH_MILLIS;
    if (timestamp < 0 || timestamp > MAX_TIMESTAMP) {
      throw new IllegalStateException("当前时间超出实体 ID 的时间戳范围");
    }
    return timestamp;
  }

  private static long waitNextMillis(long previousTimestamp) {
    long timestamp = currentTimestamp();
    while (timestamp <= previousTimestamp) {
      Thread.onSpinWait();
      timestamp = currentTimestamp();
    }
    return timestamp;
  }

  private static String encode(long value) {
    char[] encoded = new char[PADDED_LENGTH];
    Arrays.fill(encoded, BASE58_ALPHABET.charAt(0));
    int index = PADDED_LENGTH;
    while (value > 0) {
      if (index == 0) {
        throw new IllegalStateException("实体 ID 超出 Base58 编码长度");
      }
      encoded[--index] = BASE58_ALPHABET.charAt((int) (value % BASE));
      value /= BASE;
    }
    return new String(encoded);
  }

  private static int resolveNodeId() {
    String configured = System.getProperty("app.node-id");
    if (configured == null || configured.isBlank()) {
      configured = System.getenv("APP_NODE_ID");
    }
    if (configured != null && !configured.isBlank()) {
      return parseNodeId(configured.trim());
    }
    String host = System.getenv("HOSTNAME");
    if (host == null || host.isBlank()) {
      host = System.getenv("COMPUTERNAME");
    }
    if (host == null || host.isBlank()) {
      host = "unknown-host";
    }
    String process = ManagementFactory.getRuntimeMXBean().getName();
    return Math.floorMod((host + ":" + process).hashCode(), 1 << NODE_BITS);
  }

  private static int parseNodeId(String value) {
    try {
      int nodeId = Integer.parseInt(value);
      if (nodeId < 0 || nodeId >= (1 << NODE_BITS)) {
        throw new IllegalArgumentException("APP_NODE_ID 必须在 0-31 之间");
      }
      return nodeId;
    } catch (NumberFormatException error) {
      throw new IllegalArgumentException("APP_NODE_ID 必须是 0-31 之间的整数", error);
    }
  }
}
