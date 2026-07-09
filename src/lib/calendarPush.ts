// AI 플래너가 만든 dailyPlan 항목들을 캘린더(schedule_items)에 실제 일정으로 등록.
// 지정한 시작 시간부터 각 항목의 estimatedMinutes만큼 순서대로 배치한다.
// 이미 같은 날짜에 같은 제목의 일정이 있으면 건너뛰어 중복 등록을 막는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyTask } from "./types";
import { minutesToTime, timeToMinutes } from "./calendarUtils";

export interface PushResult {
  inserted: number;
  skipped: number; // 이미 캘린더에 있어 건너뛴 항목 수
}

const PLAN_PREFIX = "📚 ";

export async function pushDailyPlanToCalendar(
  supabase: SupabaseClient,
  dailyPlan: DailyTask[],
  startTime: string, // "HH:MM"
  titlePrefix: string = PLAN_PREFIX,
): Promise<PushResult> {
  if (dailyPlan.length === 0) return { inserted: 0, skipped: 0 };

  const dates = [...new Set(dailyPlan.map((d) => d.date))];
  const { data: existing, error: fetchError } = await supabase
    .from("schedule_items")
    .select("date, title")
    .in("date", dates);
  if (fetchError) throw fetchError;

  const existingKeys = new Set(
    (existing ?? []).map((e: { date: string; title: string }) => `${e.date}__${e.title}`),
  );

  const startMin = timeToMinutes(startTime) ?? 9 * 60;
  const rows = dailyPlan
    .map((d) => {
      const title = `${titlePrefix}${d.title}`;
      if (existingKeys.has(`${d.date}__${title}`)) return null;
      const endMin = startMin + Math.max(15, d.estimatedMinutes || 30);
      return {
        date: d.date,
        title,
        start_time: minutesToTime(startMin),
        end_time: minutesToTime(endMin),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const skipped = dailyPlan.length - rows.length;
  if (rows.length === 0) return { inserted: 0, skipped };

  const { error } = await supabase.from("schedule_items").insert(rows);
  if (error) throw error;
  return { inserted: rows.length, skipped };
}
