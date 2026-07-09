// 캘린더(월/주/일 뷰) 날짜 계산 & 타임그리드 레이아웃 유틸.
// 날짜 파싱은 기존 코드(page.tsx/ledger/schedule)의 관례를 그대로 따른다:
//   new Date(iso) 로 파싱하고 .toISOString().slice(0,10) 으로 되돌린다.
// (타임존에 따라 하루 오차가 날 수 있지만, 기존 페이지들과 동일한 방식으로 맞춰
//  대시보드/캘린더 사이의 날짜 불일치를 방지하는 것을 우선한다.)

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
export function parseISODate(iso: string): Date {
  return new Date(iso);
}
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
export function addMonthsISO(iso: string, months: number): string {
  const d = parseISODate(iso);
  d.setMonth(d.getMonth() + months);
  return toISODate(d);
}
export function startOfWeekISO(iso: string): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() - d.getDay());
  return toISODate(d);
}
export function startOfMonthISO(iso: string): string {
  const d = parseISODate(iso);
  d.setDate(1);
  return toISODate(d);
}

/** 월간 그리드용 42칸(6주) 날짜 목록 — 앞뒤 달의 날짜도 포함 */
export function monthGridDates(anchorISO: string): string[] {
  const gridStart = startOfWeekISO(startOfMonthISO(anchorISO));
  const dates: string[] = [];
  let cur = gridStart;
  for (let i = 0; i < 42; i++) {
    dates.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return dates;
}

/** anchorISO가 속한 주(일요일 시작)의 7일 */
export function weekDates(anchorISO: string): string[] {
  const start = startOfWeekISO(anchorISO);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}
export function minutesToTime(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface LaidOutEvent<T> {
  item: T;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

/**
 * 겹치는 일정들을 나란히(레인 분할) 배치하기 위한 간단한 그리디 알고리즘.
 * 시작시간이 없는 항목은 결과에서 제외한다(별도로 '종일' 영역에 표시).
 */
export function layoutTimedEvents<T>(
  items: T[],
  getStart: (t: T) => number | null,
  getEnd: (t: T) => number | null,
): LaidOutEvent<T>[] {
  const timed = items
    .map((item) => {
      const s = getStart(item);
      if (s == null) return null;
      const e = getEnd(item);
      const endMin = e != null && e > s ? e : s + 30;
      return { item, startMin: s, endMin };
    })
    .filter((x): x is { item: T; startMin: number; endMin: number } => x !== null)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const result: LaidOutEvent<T>[] = [];
  let group: typeof timed = [];
  let groupEnd = -1;

  const flushGroup = () => {
    if (group.length === 0) return;
    const laneEnds: number[] = [];
    for (const g of group) {
      let lane = laneEnds.findIndex((end) => end <= g.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(g.endMin);
      } else {
        laneEnds[lane] = g.endMin;
      }
      result.push({ ...g, lane, lanes: 0 }); // lanes는 아래에서 일괄 채움
    }
    const lanes = laneEnds.length;
    for (let i = result.length - group.length; i < result.length; i++) {
      result[i].lanes = lanes;
    }
    group = [];
    groupEnd = -1;
  };

  for (const t of timed) {
    if (group.length === 0 || t.startMin < groupEnd) {
      group.push(t);
      groupEnd = Math.max(groupEnd, t.endMin);
    } else {
      flushGroup();
      group.push(t);
      groupEnd = t.endMin;
    }
  }
  flushGroup();
  return result;
}
