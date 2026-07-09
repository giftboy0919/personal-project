"use client";

// 구글 캘린더 스타일의 시간대별 그리드(주/일 뷰 공용).
import { useEffect, useRef } from "react";
import type { ScheduleItemRow } from "@/lib/types";
import { layoutTimedEvents, minutesToTime, timeToMinutes } from "@/lib/calendarUtils";

export const HOUR_HEIGHT = 48; // px, 1시간당 높이
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** 왼쪽 시간 눈금 (00~23시) */
export function HourAxis() {
  return (
    <div className="tg-hours">
      {HOURS.map((h) => (
        <div className="tg-hour-label" key={h}>
          {h === 0 ? "" : `${h}시`}
        </div>
      ))}
    </div>
  );
}

/** 세로 스크롤 컨테이너 — 마운트 시 오전 7시 근처로 자동 스크롤 */
export function TimeGridScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 7 * HOUR_HEIGHT - 40;
  }, []);
  return (
    <div className="tg-scroll" ref={ref}>
      {children}
    </div>
  );
}

/** 하루치 컬럼: 종일(시간 없음) 일정 칩 + 시간대별 이벤트 블록 */
export function DayColumn({
  date,
  items,
  onSlotClick,
  onDeleteItem,
}: {
  date: string;
  items: ScheduleItemRow[];
  onSlotClick?: (date: string, time: string) => void;
  onDeleteItem?: (id: string) => void;
}) {
  const laidOut = layoutTimedEvents(
    items,
    (it) => timeToMinutes(it.start_time),
    (it) => timeToMinutes(it.end_time),
  );
  const untimed = items.filter((it) => !it.start_time);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSlotClick) return;
    if ((e.target as HTMLElement).closest(".tg-event")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMin = (y / HOUR_HEIGHT) * 60;
    const snapped = Math.round(rawMin / 30) * 30;
    onSlotClick(date, minutesToTime(snapped));
  }

  return (
    <div className="tg-col-wrap">
      <div className="tg-allday">
        {untimed.map((it) => (
          <span className="tg-chip" key={it.id}>
            {it.title}
            {onDeleteItem && (
              <button
                type="button"
                className="tg-chip-del"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteItem(it.id);
                }}
                aria-label="삭제"
              >
                ✕
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="tg-col" style={{ height: HOUR_HEIGHT * 24 }} onClick={handleClick}>
        {HOURS.map((h) => (
          <div className="tg-hour-line" key={h} style={{ top: h * HOUR_HEIGHT }} />
        ))}
        {laidOut.map(({ item, startMin, endMin, lane, lanes }) => (
          <div
            className="tg-event"
            key={item.id}
            style={{
              top: (startMin / 60) * HOUR_HEIGHT,
              height: Math.max(18, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2),
              left: `${(lane / lanes) * 100}%`,
              width: `${100 / lanes}%`,
            }}
            title={item.title}
          >
            <span className="tg-event-time">{item.start_time?.slice(0, 5)}</span>
            <span className="tg-event-title">{item.title}</span>
            {onDeleteItem && (
              <button
                type="button"
                className="tg-event-del"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteItem(item.id);
                }}
                aria-label="삭제"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
