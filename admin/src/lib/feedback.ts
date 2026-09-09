import type { Language } from "../i18n/translations";
import type { AgentFeedback } from "../types";
import type { SparklinePoint } from "../components/Sparkline";

export interface FeedbackTrend {
  points: SparklinePoint[];
  total: number;
  days: number;
}

export function buildDailyFeedbackTrend(
  items: AgentFeedback[],
  lang: Language,
): FeedbackTrend {
  const days = 7;
  const now = new Date();
  const buckets: { date: Date; count: number; label: string }[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const label =
      lang === "zh"
        ? `${date.getMonth() + 1}/${date.getDate()}`
        : `${date.getMonth() + 1}/${date.getDate()}`;
    buckets.push({ date, count: 0, label });
  }
  let total = 0;
  for (const item of items) {
    if (!item.createdAt) continue;
    const stamp = new Date(item.createdAt);
    if (Number.isNaN(stamp.getTime())) continue;
    const dayStart = new Date(stamp);
    dayStart.setHours(0, 0, 0, 0);
    const diff = Math.floor(
      (now.getTime() - dayStart.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diff < 0 || diff >= days) continue;
    const slot = buckets[days - 1 - diff];
    if (slot) {
      slot.count += 1;
      total += 1;
    }
  }
  return {
    points: buckets.map((bucket) => ({
      label: bucket.label,
      value: bucket.count,
    })),
    total,
    days,
  };
}
