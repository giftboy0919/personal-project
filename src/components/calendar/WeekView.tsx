"use client";

import type { ScheduleItemRow } from "@/lib/types";
import { WEEKDAY_LABELS, parseISODate } from "@/lib/calendarUtils";
import { DayColumn, HourAxis, TimeGridScroll } from "./TimeGrid";

export default function WeekView({
  dates,
  eventsByDate,
  today,
  onSelectDay,
  onSlotClick,
  onDeleteItem,
}: {
  dates: string[]; // 7개
  eventsByDate: Record<string, ScheduleItemRow[]>;
  today: string;
  onSelectDay: (iso: string) => void;
  onSlotClick: (date: string, time: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  return (
    <div className="week-wrap">
      <div className="week-head">
        <div className="tg-hours-spacer" />
        {dates.map((iso) => {
          const d = parseISODate(iso);
          const isToday = iso === today;
          return (
            <button
              type="button"
              className={`week-head-cell${isToday ? " today" : ""}`}
              key={iso}
              onClick={() => onSelectDay(iso)}
            >
              <div className="week-head-wd">{WEEKDAY_LABELS[d.getDay()]}</div>
              <div className={`week-head-num${isToday ? " today-badge" : ""}`}>{d.getDate()}</div>
            </button>
          );
        })}
      </div>
      <TimeGridScroll>
        <div className="week-body">
          <HourAxis />
          {dates.map((iso) => (
            <DayColumn
              key={iso}
              date={iso}
              items={eventsByDate[iso] ?? []}
              onSlotClick={onSlotClick}
              onDeleteItem={onDeleteItem}
            />
          ))}
        </div>
      </TimeGridScroll>
    </div>
  );
}
