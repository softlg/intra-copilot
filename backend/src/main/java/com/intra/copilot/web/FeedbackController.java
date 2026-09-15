package com.intra.copilot.web;

import com.intra.copilot.model.AgentDefinition;
import com.intra.copilot.model.AgentFeedback;
import com.intra.copilot.model.Conversation;
import com.intra.copilot.model.Message;
import com.intra.copilot.repo.AgentFeedbackRepository;
import com.intra.copilot.repo.ConversationRepository;
import com.intra.copilot.repo.MessageRepository;
import com.intra.copilot.service.AgentRegistry;
import com.intra.copilot.service.auth.RequestContext;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class FeedbackController {
    private static final Set<String> RATINGS = Set.of("up", "down");
    private static final Set<String> REASON_CODES =
            Set.of("INACCURATE", "IRRELEVANT", "TOO_LONG", "FORMAT_UI", "OTHER");
    private static final int MAX_REASON_TEXT = 1000;
    private static final int SUMMARY_TREND_DAYS = 30;

    private final AgentFeedbackRepository feedback;
    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final AgentRegistry agents;

    public FeedbackController(
            AgentFeedbackRepository feedback,
            ConversationRepository conversations,
            MessageRepository messages,
            AgentRegistry agents) {
        this.feedback = feedback;
        this.conversations = conversations;
        this.messages = messages;
        this.agents = agents;
    }

    public record FeedbackRequest(
            String sessionId,
            String messageId,
            Integer messageIndex,
            String agentId,
            String rating,
            String comment,
            String reasonCode,
            String reasonText,
            String messageContent,
            String userMessage) {}

    public record FeedbackView(
            String id,
            String sessionId,
            String messageId,
            Integer messageIndex,
            String agentId,
            String agentName,
            String rating,
            String reasonCode,
            String reasonText,
            String comment,
            String messageContent,
            String userMessage,
            String status,
            Instant createdAt,
            Instant ratedAt,
            Instant updatedAt) {}

    public record FeedbackPage(List<FeedbackView> items, long total, int page, int size) {}

    public record TrendPoint(String date, String label, long up, long down) {}

    public record FeedbackSummary(
            long total,
            long up,
            long down,
            double positiveRate,
            double reasonCoverage,
            long noReason,
            Map<String, Long> byAgent,
            Map<String, String> agentNames,
            List<AgentInsight> agentBreakdown,
            Map<String, Long> downReasons,
            List<String> suggestionCodes,
            int trendDays,
            List<TrendPoint> trend) {}

    public record AgentInsight(
            String agentId,
            String agentName,
            long total,
            long up,
            long down,
            double positiveRate,
            long noReason,
            String topReasonCode) {}

    @PostMapping("/feedback")
    public FeedbackView create(@RequestBody FeedbackRequest request) {
        return upsert(request);
    }

    @PutMapping("/feedback")
    public FeedbackView update(@RequestBody FeedbackRequest request) {
        return upsert(request);
    }

    @DeleteMapping("/feedback/{messageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String messageId, @RequestParam String sessionId) {
        RequestContext.Identity identity = RequestContext.current();
        Message message = requireOwnedAssistantMessage(identity, sessionId, messageId);
        feedback.findBySourceAndUserIdAndMessageId(
                        identity.source(), identity.userId(), message.getId())
                .ifPresent(item -> feedback.deleteById(item.getId()));
    }

    @GetMapping("/admin/agent-feedback")
    public FeedbackPage list(
            @RequestParam(required = false) String agentId,
            @RequestParam(required = false) String rating,
            @RequestParam(required = false) String reasonCode,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        AgentFeedbackRepository.Filter filter =
                new AgentFeedbackRepository.Filter(
                        clean(agentId),
                        normalizeRatingFilter(rating),
                        normalizeReasonFilter(reasonCode),
                        from,
                        to,
                        clean(keyword),
                        false);
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        Map<String, String> agentNames = agentNames();
        List<FeedbackView> items =
                feedback.findPage(filter, safePage, safeSize)
                        .stream()
                        .map(item -> view(item, agentNames))
                        .toList();
        return new FeedbackPage(items, feedback.count(filter), safePage, safeSize);
    }

    @GetMapping("/admin/agent-feedback/summary")
    public FeedbackSummary summary(
            @RequestParam(required = false) String agentId,
            @RequestParam(required = false) String rating,
            @RequestParam(required = false) String reasonCode,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) String keyword) {
        AgentFeedbackRepository.Filter filter =
                new AgentFeedbackRepository.Filter(
                        clean(agentId),
                        normalizeRatingFilter(rating),
                        normalizeReasonFilter(reasonCode),
                        from,
                        to,
                        clean(keyword),
                        false);
        List<AgentFeedback> all = feedback.find(filter);
        Map<String, String> agentNames = agentNames();
        long up = all.stream().filter(item -> "up".equals(item.getRating())).count();
        long down = all.stream().filter(item -> "down".equals(item.getRating())).count();
        long noReason = all.stream().filter(FeedbackController::isDownWithoutReason).count();
        long withReason = Math.max(0, down - noReason);

        Map<String, Long> byAgent =
                all.stream()
                        .collect(
                                Collectors.groupingBy(
                                        item -> valueOr(item.getAgentId(), "unknown"),
                                        LinkedHashMap::new,
                                        Collectors.counting()));
        Map<String, Long> downReasons =
                all.stream()
                        .filter(item -> "down".equals(item.getRating()))
                        .map(FeedbackController::reasonCode)
                        .collect(
                                Collectors.groupingBy(
                                        Function.identity(),
                                        LinkedHashMap::new,
                                        Collectors.counting()));

        return new FeedbackSummary(
                all.size(),
                up,
                down,
                all.isEmpty() ? 0 : roundOneDecimal(up * 100.0 / all.size()),
                down == 0 ? 100 : roundOneDecimal(withReason * 100.0 / down),
                noReason,
                byAgent,
                agentNames,
                agentInsights(all, agentNames),
                downReasons,
                suggestionCodes(down, downReasons),
                SUMMARY_TREND_DAYS,
                trend(all));
    }

    private FeedbackView upsert(FeedbackRequest request) {
        if (request == null) throw new IllegalArgumentException("反馈内容不能为空");
        String rating = request.rating() == null ? "" : request.rating().trim().toLowerCase();
        if (!RATINGS.contains(rating)) {
            throw new IllegalArgumentException("反馈类型必须是 up 或 down");
        }

        RequestContext.Identity identity = RequestContext.current();
        Message message =
                requireOwnedAssistantMessage(identity, request.sessionId(), request.messageId());
        List<Message> history =
                messages.findByConversationIdOrderByCreatedAtAsc(message.getConversationId());
        int messageIndex = indexOfMessage(history, message.getId());
        String reasonCode = cleanReasonCode(request.reasonCode());
        String reasonText = limit(clean(request.reasonText()), MAX_REASON_TEXT);
        if (reasonText == null) {
            reasonText = limit(clean(request.comment()), MAX_REASON_TEXT);
        }
        if (reasonCode == null && reasonText != null) reasonCode = "OTHER";
        if ("up".equals(rating)) {
            reasonCode = null;
            reasonText = null;
        }

        AgentFeedback item =
                feedback.findBySourceAndUserIdAndMessageId(
                                identity.source(), identity.userId(), message.getId())
                        .orElseGet(AgentFeedback::new);
        boolean ratingChanged = !rating.equals(item.getRating());
        Instant now = Instant.now();
        if (item.getCreatedAt() == null) item.setCreatedAt(now);
        if (ratingChanged || item.getRatedAt() == null) item.setRatedAt(now);
        item.setUpdatedAt(now);
        item.setSource(identity.source());
        item.setUserId(identity.userId());
        item.setSessionId(message.getConversationId());
        item.setMessageId(message.getId());
        item.setMessageIndex(messageIndex);
        item.setAgentId(message.getAgentId());
        item.setRating(rating);
        item.setReasonCode(reasonCode);
        item.setReasonText(reasonText);
        item.setComment(reasonText);
        item.setMessageContent(limit(message.getContent(), 12000));
        item.setUserMessage(limit(previousUserMessage(history, messageIndex), 4000));
        item.setStatus("ACTIVE");
        AgentFeedback saved = feedback.save(item);
        return view(saved, agentNames());
    }

    private Message requireOwnedAssistantMessage(
            RequestContext.Identity identity, String sessionId, String messageId) {
        String cleanSessionId = clean(sessionId);
        String cleanMessageId = clean(messageId);
        if (cleanSessionId == null || cleanMessageId == null) {
            throw new IllegalArgumentException("sessionId 和 messageId 不能为空");
        }
        Conversation conversation =
                conversations
                        .findById(cleanSessionId)
                        .orElseThrow(() -> new NoSuchElementException("会话不存在"));
        if (!identity.source().equals(conversation.getSource())
                || !identity.userId().equals(conversation.getUserId())) {
            throw new NoSuchElementException("会话不存在");
        }
        Message message =
                messages.findById(cleanMessageId)
                        .orElseThrow(() -> new NoSuchElementException("消息不存在"));
        if (!conversation.getId().equals(message.getConversationId())
                || !"assistant".equals(message.getRole())) {
            throw new NoSuchElementException("消息不存在");
        }
        return message;
    }

    private Map<String, String> agentNames() {
        return agents.allDefinitions()
                .stream()
                .collect(
                        Collectors.toMap(
                                AgentDefinition::getId,
                                AgentDefinition::getDisplayName,
                                (first, ignored) -> first));
    }

    private FeedbackView view(AgentFeedback item, Map<String, String> agentNames) {
        String agentId = valueOr(item.getAgentId(), "");
        return new FeedbackView(
                item.getId(),
                item.getSessionId(),
                item.getMessageId(),
                item.getMessageIndex(),
                item.getAgentId(),
                agentNames.getOrDefault(agentId, ""),
                item.getRating(),
                reasonCode(item),
                item.getReasonText(),
                item.getReasonText(),
                item.getMessageContent(),
                item.getUserMessage(),
                item.getStatus(),
                item.getCreatedAt(),
                item.getRatedAt(),
                item.getUpdatedAt());
    }

    private List<AgentInsight> agentInsights(
            List<AgentFeedback> all, Map<String, String> agentNames) {
        Map<String, List<AgentFeedback>> grouped =
                all.stream()
                        .collect(
                                Collectors.groupingBy(
                                        item -> valueOr(item.getAgentId(), ""),
                                        LinkedHashMap::new,
                                        Collectors.toList()));

        return grouped.entrySet()
                .stream()
                .map(
                        entry -> {
                            List<AgentFeedback> items = entry.getValue();
                            long total = items.size();
                            long up =
                                    items.stream()
                                            .filter(item -> "up".equals(item.getRating()))
                                            .count();
                            long down =
                                    items.stream()
                                            .filter(item -> "down".equals(item.getRating()))
                                            .count();
                            long noReason =
                                    items.stream()
                                            .filter(FeedbackController::isDownWithoutReason)
                                            .count();
                            String topReasonCode =
                                    items.stream()
                                            .filter(item -> "down".equals(item.getRating()))
                                            .map(FeedbackController::reasonCode)
                                            .collect(
                                                    Collectors.groupingBy(
                                                            Function.identity(),
                                                            Collectors.counting()))
                                            .entrySet()
                                            .stream()
                                            .max(
                                                    Comparator.comparingLong(
                                                                    Map.Entry<String, Long>
                                                                            ::getValue)
                                                            .thenComparing(Map.Entry::getKey))
                                            .map(Map.Entry::getKey)
                                            .orElse(null);
                            return new AgentInsight(
                                    entry.getKey(),
                                    agentNames.getOrDefault(
                                            entry.getKey(), valueOr(entry.getKey(), "")),
                                    total,
                                    up,
                                    down,
                                    total == 0 ? 0 : roundOneDecimal(up * 100.0 / total),
                                    noReason,
                                    topReasonCode);
                        })
                .sorted(
                        Comparator.comparingLong(AgentInsight::down)
                                .reversed()
                                .thenComparing(
                                        Comparator.comparingLong(AgentInsight::total).reversed())
                                .thenComparing(AgentInsight::agentName))
                .toList();
    }

    private List<TrendPoint> trend(List<AgentFeedback> all) {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        Map<LocalDate, long[]> counts = new LinkedHashMap<>();
        for (int offset = SUMMARY_TREND_DAYS - 1; offset >= 0; offset--) {
            counts.put(today.minusDays(offset), new long[] {0, 0});
        }
        DateTimeFormatter labelFormatter = DateTimeFormatter.ofPattern("M/d");
        for (AgentFeedback item : all) {
            Instant ratedAt = item.getRatedAt() == null ? item.getCreatedAt() : item.getRatedAt();
            if (ratedAt == null) continue;
            LocalDate date = ratedAt.atZone(zone).toLocalDate();
            long[] count = counts.get(date);
            if (count == null) continue;
            if ("up".equals(item.getRating())) count[0]++;
            if ("down".equals(item.getRating())) count[1]++;
        }
        return counts.entrySet()
                .stream()
                .map(
                        entry ->
                                new TrendPoint(
                                        entry.getKey().toString(),
                                        entry.getKey().format(labelFormatter),
                                        entry.getValue()[0],
                                        entry.getValue()[1]))
                .toList();
    }

    private static List<String> suggestionCodes(long down, Map<String, Long> downReasons) {
        List<String> result = new ArrayList<>();
        if (reasonCount(downReasons, "MISSING") > 0) result.add("MISSING_REASON");
        if (reasonCount(downReasons, "INACCURATE") > 0) result.add("INACCURATE");
        if (reasonCount(downReasons, "IRRELEVANT") > 0) result.add("IRRELEVANT");
        if (reasonCount(downReasons, "TOO_LONG") > 0) result.add("TOO_LONG");
        if (reasonCount(downReasons, "FORMAT_UI") > 0) result.add("FORMAT_UI");
        if (result.isEmpty() && down > 0) result.add("REVIEW_DETAILS");
        return result;
    }

    private static long reasonCount(Map<String, Long> reasons, String code) {
        return reasons.getOrDefault(code, 0L);
    }

    private static String reasonCode(AgentFeedback item) {
        if ("up".equals(item.getRating())) return null;
        if (!isBlank(item.getReasonCode())) return item.getReasonCode().trim();
        return isBlank(item.getReasonText()) ? "MISSING" : "OTHER";
    }

    private static boolean isDownWithoutReason(AgentFeedback item) {
        return "down".equals(item.getRating())
                && isBlank(item.getReasonCode())
                && isBlank(item.getReasonText());
    }

    private static String cleanReasonCode(String value) {
        String code = clean(value);
        if (code == null) return null;
        String normalized = code.toUpperCase();
        if (!REASON_CODES.contains(normalized)) {
            throw new IllegalArgumentException("反馈原因类型无效");
        }
        return normalized;
    }

    private static String normalizeRatingFilter(String value) {
        String rating = clean(value);
        if (rating == null || "all".equalsIgnoreCase(rating)) return null;
        String normalized = rating.toLowerCase();
        if (!RATINGS.contains(normalized)) {
            throw new IllegalArgumentException("反馈类型筛选无效");
        }
        return normalized;
    }

    private static String normalizeReasonFilter(String value) {
        String reason = clean(value);
        if (reason == null || "all".equalsIgnoreCase(reason)) return null;
        String normalized = reason.toUpperCase();
        if (!"MISSING".equals(normalized) && !REASON_CODES.contains(normalized)) {
            throw new IllegalArgumentException("反馈原因筛选无效");
        }
        return normalized;
    }

    private static int indexOfMessage(List<Message> history, String messageId) {
        for (int index = 0; index < history.size(); index++) {
            if (messageId.equals(history.get(index).getId())) return index;
        }
        return -1;
    }

    private static String previousUserMessage(List<Message> history, int messageIndex) {
        for (int index = Math.min(messageIndex - 1, history.size() - 1); index >= 0; index--) {
            Message item = history.get(index);
            if ("user".equals(item.getRole())) return item.getContent();
        }
        return null;
    }

    private static String limit(String value, int max) {
        if (value == null || value.length() <= max) return value;
        return value.substring(0, max);
    }

    private static String clean(String value) {
        if (value == null) return null;
        String cleaned = value.trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String valueOr(String value, String fallback) {
        return isBlank(value) ? fallback : value;
    }

    private static double roundOneDecimal(double value) {
        return Math.round(value * 10d) / 10d;
    }
}
