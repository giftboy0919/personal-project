"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import TodoList from "@/components/TodoList";
import MonthView from "@/components/calendar/MonthView";
import WeekView from "@/components/calendar/WeekView";
import { DayColumn, HourAxis, TimeGridScroll } from "@/components/calendar/TimeGrid";
import {
  addDaysISO,
  addMonthsISO,
  isoToday,
  minutesToTime,
  monthGridDates,
  parseISODate,
  weekDates,
} from "@/lib/calendarUtils";
import type { SavedPlanRow, ScheduleItemRow, TaskRow } from "@/lib/types";

type ViewMode = "month" | "week" | "day";
const WD = ["일", "월", "화", "수", "목", "금", "토"];

function prettyDate(iso: string) {
  const d = parseISODate(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
function monthLabel(iso: string) {
  const d = parseISODate(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}
function weekLabel(dates: string[]) {
  const a = parseISODate(dates[0]);
  const b = parseISODate(dates[6]);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getDate()}일`;
  }
  return `${a.getMonth() + 1}월 ${a.getDate()}일 ~ ${b.getMonth() + 1}월 ${b.getDate()}일`;
}

interface VisionResult {
  readable: boolean;
  detectedBusy: { start: string; end: string; label: string }[];
  placements: { title: string; start_time: string; end_time: string }[];
  note: string;
}

function ScheduleInner() {
  const { session, loading: authLoading } = useAuth();
  const params = useSearchParams();

  // URL 쿼리(?view=&date=)가 있으면 첫 진입 시에만 반영 (예: 홈에서 "캘린더 →" 클릭).
  // 이후 뷰/날짜 전환은 상태로만 관리 — router.replace 로 URL을 계속 되쓰면
  // 리렌더가 리렌더를 부르는 루프가 생길 수 있어 의도적으로 URL은 갱신하지 않는다.
  const [view, setView] = useState<ViewMode>((params.get("view") as ViewMode) || "month");
  const [date, setDate] = useState(params.get("date") || isoToday());

  const [eventsByDate, setEventsByDate] = useState<Record<string, ScheduleItemRow[]>>({});
  const [loading, setLoading] = useState(true);

  // 일별 뷰 전용: 자동배치 스크린샷 도구에 쓰이는 학습 항목(계획+할일) 계산용
  const [dayPlans, setDayPlans] = useState<SavedPlanRow[]>([]);
  const [dayTasks, setDayTasks] = useState<TaskRow[]>([]);

  // 수동 일정 추가 폼
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const formCardRef = useRef<HTMLFormElement>(null);

  // 스크린샷 자동배치
  const [image, setImage] = useState<{ preview: string; base64: string; mediaType: string } | null>(null);
  const [dayStart, setDayStart] = useState("09:00");
  const [dayEnd, setDayEnd] = useState("23:00");
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [vLoading, setVLoading] = useState(false);
  const [vError, setVError] = useState<string | null>(null);

  const gridDates = useMemo(() => {
    if (view === "month") return monthGridDates(date);
    if (view === "week") return weekDates(date);
    return [date];
  }, [view, date]);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    const rangeStart = gridDates[0];
    const rangeEnd = gridDates[gridDates.length - 1];
    const { data } = await supabase
      .from("schedule_items")
      .select("*")
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
      .order("start_time", { ascending: true, nullsFirst: true });
    const map: Record<string, ScheduleItemRow[]> = {};
    for (const row of (data as ScheduleItemRow[]) ?? []) {
      (map[row.date] ??= []).push(row);
    }
    setEventsByDate(map);
    setLoading(false);
  }, [gridDates, session]);

  useEffect(() => {
    load();
  }, [load]);

  // 일별 뷰일 때만 자동배치용 학습항목 데이터 로드
  const loadDayExtras = useCallback(async () => {
    if (!supabase || !session || view !== "day") return;
    const [p, t] = await Promise.all([
      supabase.from("plans").select("id, goal, result, done_tasks"),
      supabase.from("tasks").select("*").eq("date", date),
    ]);
    setDayPlans((p.data as SavedPlanRow[]) ?? []);
    setDayTasks((t.data as TaskRow[]) ?? []);
  }, [view, date, session]);

  useEffect(() => {
    loadDayExtras();
  }, [loadDayExtras]);

  const studyItems = useMemo(() => {
    const items: { title: string; minutes: number }[] = [];
    for (const p of dayPlans) {
      (p.result?.dailyPlan ?? []).forEach((d, i) => {
        if (d.date === date && !(p.done_tasks ?? []).includes(i)) {
          items.push({ title: d.title, minutes: d.estimatedMinutes || 30 });
        }
      });
    }
    for (const t of dayTasks) {
      if (!t.done) items.push({ title: t.title, minutes: 45 });
    }
    return items;
  }, [dayPlans, dayTasks, date]);

  // ── 네비게이션 ──────────────────────────────────────────
  function goPrev() {
    if (view === "month") setDate(addMonthsISO(date, -1));
    else if (view === "week") setDate(addDaysISO(date, -7));
    else setDate(addDaysISO(date, -1));
  }
  function goNext() {
    if (view === "month") setDate(addMonthsISO(date, 1));
    else if (view === "week") setDate(addDaysISO(date, 7));
    else setDate(addDaysISO(date, 1));
  }
  function goToday() {
    setDate(isoToday());
  }
  function selectDay(iso: string) {
    setDate(iso);
    setView("day");
  }

  // 그리드 빈 칸 클릭 → 그 날짜/시간으로 일별 뷰 이동 + 추가 폼에 시간 미리 채우기
  function handleSlotClick(clickedDate: string, time: string) {
    setDate(clickedDate);
    setView("day");
    setStartTime(time);
    const min = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + 60;
    setEndTime(minutesToTime(Math.min(min, 23 * 60 + 30)));
    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleRef.current?.focus();
    });
  }

  async function del(id: string) {
    if (!supabase) return;
    setEventsByDate((prev) => {
      const next: Record<string, ScheduleItemRow[]> = {};
      for (const [k, v] of Object.entries(prev)) next[k] = v.filter((it) => it.id !== id);
      return next;
    });
    await supabase.from("schedule_items").delete().eq("id", id);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVError(null);
    setVision(null);
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const comma = url.indexOf(",");
      const mediaType = url.slice(5, url.indexOf(";"));
      setImage({ preview: url, base64: url.slice(comma + 1), mediaType });
    };
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!image) return;
    setVLoading(true);
    setVError(null);
    setVision(null);
    try {
      const weekday = WD[parseISODate(date).getDay()];
      const res = await fetch("/api/timetable-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: image.base64,
          mediaType: image.mediaType,
          weekday,
          dateLabel: `${date} (${weekday})`,
          dayStart,
          dayEnd,
          items: studyItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "분석에 실패했습니다.");
      const v = data as VisionResult;
      setVision(v);
      setSelected(new Set(v.placements.map((_, i) => i)));
    } catch (err) {
      setVError(err instanceof Error ? err.message : "분석에 실패했습니다.");
    } finally {
      setVLoading(false);
    }
  }

  async function addPlacements() {
    if (!supabase || !vision) return;
    const chosen = vision.placements.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("schedule_items").insert(
      chosen.map((p) => ({
        date,
        title: `📚 ${p.title}`,
        start_time: p.start_time || null,
        end_time: p.end_time || null,
      })),
    );
    setBusy(false);
    if (!error) {
      setVision(null);
      setImage(null);
      load();
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("schedule_items").insert({
      date,
      title: title.trim(),
      start_time: startTime || null,
      end_time: endTime || null,
      location: location.trim() || null,
    });
    setBusy(false);
    if (!error) {
      setTitle("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      load();
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <div className="card">
          <p className="save-note">캘린더를 쓰려면 Supabase 연결(로그인)이 필요합니다.</p>
        </div>
      </main>
    );
  }
  if (authLoading) return null;

  const headerLabel =
    view === "month" ? monthLabel(date) : view === "week" ? weekLabel(gridDates) : prettyDate(date);

  return (
    <main className="page">
      <header className="cal-header">
        <div className="cal-title-row">
          <h1 className="dash-title">캘린더</h1>
          <div className="view-tabs">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                className={`view-tab${view === v ? " active" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "month" ? "월" : v === "week" ? "주" : "일"}
              </button>
            ))}
          </div>
        </div>
        <div className="cal-nav">
          <button className="btn btn-ghost btn-sm" onClick={goPrev}>‹</button>
          <span className="cal-nav-label">{headerLabel}</span>
          <button className="btn btn-ghost btn-sm" onClick={goNext}>›</button>
          <button className="btn btn-ghost btn-sm" onClick={goToday}>오늘</button>
        </div>
      </header>

      {loading && Object.keys(eventsByDate).length === 0 ? (
        <div className="card">
          <p className="save-note">불러오는 중…</p>
        </div>
      ) : (
        <>
          {view === "month" && (
            <MonthView
              dates={gridDates}
              monthAnchor={date}
              eventsByDate={eventsByDate}
              today={isoToday()}
              onSelectDay={selectDay}
            />
          )}

          {view === "week" && (
            <WeekView
              dates={gridDates}
              eventsByDate={eventsByDate}
              today={isoToday()}
              onSelectDay={selectDay}
              onSlotClick={handleSlotClick}
              onDeleteItem={del}
            />
          )}

          {view === "day" && (
            <>
              <div className="week-wrap">
                <TimeGridScroll>
                  <div className="week-body">
                    <HourAxis />
                    <DayColumn
                      date={date}
                      items={eventsByDate[date] ?? []}
                      onSlotClick={handleSlotClick}
                      onDeleteItem={del}
                    />
                  </div>
                </TimeGridScroll>
              </div>

              <TodoList date={date} />

              {/* 📷 시간표 스크린샷 → 빈 시간에 공부 자동배치 */}
              <div className="card">
                <h2 className="section-title">📷 시간표 스크린샷으로 공부 자동배치</h2>
                <p className="save-note" style={{ marginTop: 0, marginBottom: 12 }}>
                  주간 시간표 스크린샷을 올리면, AI가 <b>{WD[parseISODate(date).getDay()]}요일</b>의
                  빈 시간을 찾아 아래 학습 항목을 배치해줍니다.
                </p>

                <div className="study-items">
                  배치할 학습 항목 <b>{studyItems.length}개</b>
                  {studyItems.length > 0 && (
                    <span className="study-list">
                      {" "}
                      — {studyItems.slice(0, 4).map((s) => s.title).join(", ")}
                      {studyItems.length > 4 ? " 외" : ""}
                    </span>
                  )}
                  {studyItems.length === 0 && (
                    <span className="study-list">
                      {" "}
                      (플래너에서 계획을 저장하거나 할 일을 추가하면 채워져요)
                    </span>
                  )}
                </div>

                <div className="row" style={{ marginTop: 14 }}>
                  <div className="field">
                    <label>하루 시작 시간</label>
                    <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>하루 종료 시간</label>
                    <input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label>시간표 이미지</label>
                  <input type="file" accept="image/*" onChange={onFile} />
                </div>

                {image && <img src={image.preview} alt="시간표 미리보기" className="tt-preview" />}

                <button className="btn btn-primary" onClick={analyze} disabled={!image || vLoading}>
                  {vLoading ? (
                    <>
                      <span className="spinner" /> AI가 빈 시간 분석 중…
                    </>
                  ) : (
                    <>🔍 빈 시간 분석 &amp; 배치</>
                  )}
                </button>
                {vError && <p className="error">{vError}</p>}

                {vision && (
                  <div className="vision-result">
                    {!vision.readable ? (
                      <p className="error">시간표를 읽지 못했어요. 더 선명한 이미지를 올려주세요.</p>
                    ) : (
                      <>
                        {vision.detectedBusy.length > 0 && (
                          <>
                            <h3 className="tip-h">읽은 바쁜 시간</h3>
                            {vision.detectedBusy.map((b, i) => (
                              <div className="busy-row" key={i}>
                                <span className="sched-time">
                                  {b.start}~{b.end}
                                </span>
                                <span>{b.label}</span>
                              </div>
                            ))}
                          </>
                        )}
                        <h3 className="tip-h">배치 제안 (체크한 항목만 추가)</h3>
                        {vision.placements.length === 0 ? (
                          <p className="empty">빈 시간에 배치할 수 있는 항목이 없어요.</p>
                        ) : (
                          vision.placements.map((p, i) => (
                            <label className="place-row" key={i}>
                              <input
                                type="checkbox"
                                checked={selected.has(i)}
                                onChange={() => {
                                  const s = new Set(selected);
                                  if (s.has(i)) s.delete(i);
                                  else s.add(i);
                                  setSelected(s);
                                }}
                              />
                              <span className="sched-time">
                                {p.start_time}~{p.end_time}
                              </span>
                              <span className="place-title">📚 {p.title}</span>
                            </label>
                          ))
                        )}
                        {vision.note && <p className="save-note">💡 {vision.note}</p>}
                        {vision.placements.length > 0 && (
                          <button
                            className="btn btn-primary"
                            style={{ marginTop: 12 }}
                            onClick={addPlacements}
                            disabled={busy || selected.size === 0}
                          >
                            ＋ 선택한 {selected.size}개 시간표에 추가
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 수동 추가 */}
              <form className="card" onSubmit={addItem} ref={formCardRef}>
                <h2 className="section-title">직접 추가</h2>
                <div className="field">
                  <label>일정 제목</label>
                  <input
                    ref={titleRef}
                    placeholder="예: 자료구조 강의 / 팀 회의"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="row">
                  <div className="field">
                    <label>
                      시작 <span className="hint">(선택)</span>
                    </label>
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>
                      종료 <span className="hint">(선택)</span>
                    </label>
                    <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>
                    장소 <span className="hint">(선택)</span>
                  </label>
                  <input
                    placeholder="공학관 301 / 온라인"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? <span className="spinner" /> : "일정 추가"}
                </button>
              </form>
            </>
          )}
        </>
      )}

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}

export default function SchedulePage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="card">
            <p className="save-note">불러오는 중…</p>
          </div>
        </main>
      }
    >
      <ScheduleInner />
    </Suspense>
  );
}
