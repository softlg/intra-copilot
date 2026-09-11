package com.intra.copilot.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class EntityIdGeneratorTest {

  private static final String BASE58_ALPHABET =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  @Test
  void createsThirteenCharacterModulePrefixedIds() {
    String id = EntityIdGenerator.next("AG");

    assertEquals(13, id.length());
    assertTrue(id.startsWith("AG"));
    for (int index = 2; index < id.length(); index++) {
      assertTrue(BASE58_ALPHABET.indexOf(id.charAt(index)) >= 0);
    }
  }

  @Test
  void keepsIdsMonotonicAndUnique() {
    Set<String> ids = new HashSet<>();
    String previous = null;
    for (int index = 0; index < 10_000; index++) {
      String current = EntityIdGenerator.next("IV");
      assertTrue(ids.add(current));
      if (previous != null) {
        assertTrue(previous.compareTo(current) < 0, "ID 应按生成顺序递增");
      }
      previous = current;
    }
  }

  @Test
  void rejectsInvalidModuleCodes() {
    assertThrows(IllegalArgumentException.class, () -> EntityIdGenerator.next("a"));
    assertThrows(IllegalArgumentException.class, () -> EntityIdGenerator.next("A1"));
    assertThrows(IllegalArgumentException.class, () -> EntityIdGenerator.next("ABCD"));
  }
}
