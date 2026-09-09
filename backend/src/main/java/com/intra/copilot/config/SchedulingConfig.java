package com.intra.copilot.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables {@code @Scheduled} processing for the indexing queue.
 *
 * <p>The queue itself can be turned off independently with {@code kb.indexing.enabled},
 * which is what tests and single-node maintenance windows use.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {}
