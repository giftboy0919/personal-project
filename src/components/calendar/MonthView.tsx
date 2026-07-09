"use client";

import type { ScheduleItemRow } from "@/lib/types";
import { WEEKDAY_LABELS, parseISODate } from "@/lib/calendarUtils";

export default function MonthView({
  dates,
  monthAnchor,
  eventsByDate,
  today,
  onSelectDay,
}: {
  dates: string[]; // 42개 (6주)
  monthAnchor: string; // 이 달의 아무 날짜(월 판별용)
  eventsByDate: Record<string, ScheduleItemRow[]>;
  today: string;
  onSelectDay: (iso: string) => void;
}) {
  const curMonth = parseISODate(monthAnchor).getMonth();

  return (
    <div className="month-grid">
      <div className="month-wd-row">
        {WEEKDAY_LABELS.map((w) => (
          <div className="month-wd" key={w}>
            {w}
          </div>
        ))}
      </div>
      <div className="month-cells">
        {dates.map((iso) => {
          const d = parseISODate(iso);
          const inMonth = d.getMonth() === curMonth;
          const items = eventsByDate[iso] ?? [];
          const isToday = iso === today;
          return (
            <button
              type="button"
              key={iso}
              className={`month-cell${inMonth ? "" : " out"}${isToday ? " today" : ""}`}
              onClick={() => onSelectDay(iso)}
            >
              <span className={`month-daynum${isToday ? " today-badge" : ""}`}>
                {d.getDate()}
              </span>
              <div className="month-chips">
                {items.slice(0, 3).map((it) => (
                  <span className="month-chip" key={it.id}>
                    {it.start_time ? `${it.start_time.slice(0, 5)} ` : ""}
                    {it.title}
                  </span>
                ))}
                {items.length > 3 && <span className="month-more">+{items.length - 3}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
