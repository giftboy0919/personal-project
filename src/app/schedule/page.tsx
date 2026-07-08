"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import type { SavedPlanRow, ScheduleItemRow, TaskRow } from "@/lib/types";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(iso: string) {
  return WD[new Date(iso).getDay()];
}
function prettyDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}

interface VisionResult {
  readable: boolean;
  detectedBusy: { start: string; end: string; label: string }[];
  placements: { title: string; start_time: string; end_time: string }[];
  note: string;
}

export default function SchedulePage() {
  const { session, loading: authLoading } = useAuth();
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState<ScheduleItemRow[]>([]);
  const [plans, setPlans] = useState<SavedPlanRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 수동 추가 폼
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  // 스크린샷 자동배치
  const [image, setImage] = useState<{ preview: string; base64: string; mediaType: string } | null>(null);
  const [dayStart, setDayStart] = useState("09:00");
  const [dayEnd, setDayEnd] = useState("23:00");
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [vLoading, setVLoading] = useState(false);
  const [vError, setVError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    const [r, p, t] = await Promise.all([
      supabase
        .from("schedule_items")
        .select("*")
        .eq("date", date)
        .order("start_time", { ascending: true, nullsFirst: true }),
      supabase.from("plans").select("id, goal, result, done_tasks"),
      supabase.from("tasks").select("*").eq("date", date),
    ]);
    setRows((r.data as ScheduleItemRow[]) ?? []);
    setPlans((p.data as SavedPlanRow[]) ?? []);
    setTasks((t.data as TaskRow[]) ?? []);
    setLoading(false);
  }, [date, session]);

  useEffect(() => {
    load();
  }, [load]);

  // 오늘 배치할 학습 항목 = (저장 계획의 이 날짜 미완료 항목) + (이 날짜 미완료 할 일)
  const studyItems = useMemo(() => {
    const items: { title: string; minutes: number }[] = [];
    for (const p of plans) {
      (p.result?.dailyPlan ?? []).forEach((d, i) => {
        if (d.date === date && !(p.done_tasks ?? []).includes(i)) {
          items.push({ title: d.title, minutes: d.estimatedMinutes || 30 });
        }
      });
    }
    for (const t of tasks) {
      if (!t.done) items.push({ title: t.title, minutes: 45 });
    }
    return items;
  }, [plans, tasks, date]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVError(null);
    setVision(null);
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result); // data:image/png;base64,XXXX
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
      const res = await fetch("/api/timetable-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: image.base64,
          mediaType: image.mediaType,
          weekday: weekdayOf(date),
          dateLabel: `${date} (${weekdayOf(date)})`,
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

  async function del(id: string) {
    if (!supabase) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("schedule_items").delete().eq("id", id);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <div className="card">
          <p className="save-note">시간표를 쓰려면 Supabase 연결(로그인)이 필요합니다.</p>
        </div>
      </main>
    );
  }
  if (authLoading) return null;

  return (
    <main className="page">
      <header className="dash-head">
        <div>
          <h1 className="dash-title">시간표</h1>
          <p className="dash-sub">{prettyDate(date)}</p>
        </div>
        <div className="date-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || isoToday())} />
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))}>›</button>
          {date !== isoToday() && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDate(isoToday())}>오늘</button>
          )}
        </div>
      </header>

      {/* 📷 시간표 스크린샷 → 빈 시간에 공부 자동배치 */}
      <div className="card">
        <h2 className="section-title">📷 시간표 스크린샷으로 공부 자동배치</h2>
        <p className="save-note" style={{ marginTop: 0, marginBottom: 12 }}>
          주간 시간표 스크린샷을 올리면, AI가 <b>{weekdayOf(date)}요일</b>의 빈 시간을 찾아
          아래 학습 항목을 배치해줍니다.
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
            <span className="study-list"> (플래너에서 계획을 저장하거나 오늘 할 일을 추가하면 채워져요)</span>
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

        {image && (
          <img src={image.preview} alt="시간표 미리보기" className="tt-preview" />
        )}

        <button
          className="btn btn-primary"
          onClick={analyze}
          disabled={!image || vLoading}
        >
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
                        <span className="sched-time">{b.start}~{b.end}</span>
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
                      <span className="sched-time">{p.start_time}~{p.end_time}</span>
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
      <form className="card" onSubmit={addItem}>
        <h2 className="section-title">직접 추가</h2>
        <div className="field">
          <label>일정 제목</label>
          <input placeholder="예: 자료구조 강의 / 팀 회의" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="row">
          <div className="field">
            <label>시작 <span className="hint">(선택)</span></label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label>종료 <span className="hint">(선택)</span></label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>장소 <span className="hint">(선택)</span></label>
          <input placeholder="공학관 301 / 온라인" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : "일정 추가"}
        </button>
      </form>

      <div className="results">
        <div className="card">
          <h2 className="section-title">이 날의 일정</h2>
          {loading ? (
            <p className="save-note">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="empty">등록된 일정이 없어요.</p>
          ) : (
            rows.map((s) => (
              <div className="sched-row full" key={s.id}>
                <span className="sched-time">
                  {s.start_time ? s.start_time.slice(0, 5) : "종일"}
                  {s.end_time ? `~${s.end_time.slice(0, 5)}` : ""}
                </span>
                <div className="sched-body">
                  <div className="sched-title">{s.title}</div>
                  {s.location && <div className="sched-loc">📍 {s.location}</div>}
                </div>
                <button className="task-del" onClick={() => del(s.id)} aria-label="삭제">✕</button>
              </div>
            ))
          )}
        </div>
      </div>

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}
