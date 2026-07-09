"use client";

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { pushDailyPlanToCalendar } from "@/lib/calendarPush";
import DifficultyPrompt from "@/components/DifficultyPrompt";
import { needsReview, type DifficultyLevel, type SavedPlanRow } from "@/lib/types";

function formatDateParts(iso: string): { num: string; mon: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { num: "–", mon: iso };
  return { num: String(d.getDate()), mon: `${d.getMonth() + 1}월` };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const DIFF_BADGE_CLASS: Record<DifficultyLevel, string> = {
  "매우 어려움": "diff-badge-0",
  어려움: "diff-badge-1",
  보통: "diff-badge-2",
  쉬움: "diff-badge-3",
  "매우 쉬움": "diff-badge-4",
};

export default function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [row, setRow] = useState<SavedPlanRow | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [difficulty, setDifficulty] = useState<Record<number, DifficultyLevel>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  const [calStartTime, setCalStartTime] = useState("19:00");
  const [calState, setCalState] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [calMsg, setCalMsg] = useState<string | null>(null);

  // 복습 추가 버튼 — 항목별로 눌렀는지 기록(연타/중복 방지용, 새로고침하면 초기화됨)
  const [reviewAdded, setReviewAdded] = useState<Set<number>>(new Set());
  const [reviewBusyIndex, setReviewBusyIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase
      .from("plans")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error: dbError }) => {
        if (dbError) {
          setError(dbError.message);
        } else if (data) {
          const r = data as SavedPlanRow;
          setRow(r);
          setDone(new Set(Array.isArray(r.done_tasks) ? r.done_tasks : []));
          setDifficulty(r.difficulty ?? {});
        }
        setLoading(false);
      });
  }, [id]);

  // 체크 해제는 바로 처리, 체크는 난이도 설문을 먼저 띄운다.
  function onCheckboxChange(index: number, currentlyDone: boolean) {
    if (currentlyDone) uncheck(index);
    else setPendingIndex(index);
  }

  async function uncheck(index: number) {
    if (!supabase) return;
    const next = new Set(done);
    next.delete(index);
    setDone(next);
    setSaving(true);
    const { error: dbError } = await supabase
      .from("plans")
      .update({ done_tasks: Array.from(next).sort((a, b) => a - b) })
      .eq("id", id);
    setSaving(false);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setDone(done);
    }
  }

  async function complete(index: number, level: DifficultyLevel) {
    if (!supabase) return;
    const nextDone = new Set(done);
    nextDone.add(index);
    const nextDiff = { ...difficulty, [index]: level };
    setDone(nextDone);
    setDifficulty(nextDiff);
    setPendingIndex(null);

    setSaving(true);
    const { error: dbError } = await supabase
      .from("plans")
      .update({
        done_tasks: Array.from(nextDone).sort((a, b) => a - b),
        difficulty: nextDiff,
      })
      .eq("id", id);
    setSaving(false);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setDone(done);
      setDifficulty(difficulty);
    }
  }

  async function handlePushToCalendar() {
    if (!supabase || !row?.result?.dailyPlan?.length) return;
    setCalState("pushing");
    setCalMsg(null);
    try {
      const { inserted, skipped } = await pushDailyPlanToCalendar(
        supabase,
        row.result.dailyPlan,
        calStartTime,
      );
      setCalState("done");
      setCalMsg(
        skipped > 0
          ? `${inserted}개 일정을 캘린더에 등록했어요. (이미 등록된 ${skipped}개는 건너뜀)`
          : `${inserted}개 일정을 캘린더에 등록했어요.`,
      );
    } catch (err) {
      setCalState("error");
      setCalMsg(err instanceof Error ? err.message : "캘린더 등록에 실패했습니다.");
    }
  }

  async function addReviewToday(index: number) {
    if (!supabase || !row) return;
    const item = row.result.dailyPlan[index];
    if (!item) return;
    setReviewBusyIndex(index);
    try {
      await pushDailyPlanToCalendar(
        supabase,
        [{ ...item, date: todayISO() }],
        "20:00",
        "🔁 복습: ",
      );
      setReviewAdded((prev) => new Set(prev).add(index));
    } catch (err) {
      setError(err instanceof Error ? err.message : "복습 일정 추가에 실패했습니다.");
    } finally {
      setReviewBusyIndex(null);
    }
  }

  // 완료했는데 "매우 어려움"/"어려움"으로 답한 항목 = 복습이 필요한 단원
  const reviewItems = useMemo(() => {
    if (!row) return [];
    const items: { index: number; title: string; date: string; level: DifficultyLevel }[] = [];
    row.result.dailyPlan.forEach((d, i) => {
      if (done.has(i) && needsReview(difficulty[i])) {
        items.push({ index: i, title: d.title, date: d.date, level: difficulty[i] });
      }
    });
    // 매우 어려움 먼저
    return items.sort((a, b) => (a.level === b.level ? 0 : a.level === "매우 어려움" ? -1 : 1));
  }, [row, done, difficulty]);

  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <div className="card">
          <p className="save-note">Supabase가 설정되지 않았습니다.</p>
          <Link href="/">← 홈으로</Link>
        </div>
      </main>
    );
  }

  const total = row?.result?.dailyPlan?.length ?? 0;
  const pct = total ? Math.round((done.size / total) * 100) : 0;

  return (
    <main className="page">
      <div className="topbar">
        <Link href="/plans" className="back-link">
          ← 계획 목록
        </Link>
        {saving && <span className="save-note">저장 중…</span>}
      </div>

      {loading ? (
        <div className="card">
          <p className="save-note">불러오는 중…</p>
        </div>
      ) : error && !row ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : !row ? (
        <div className="card">
          <p className="save-note">계획을 찾을 수 없습니다.</p>
        </div>
      ) : (
        <>
          <header className="hero">
            <span className="badge">진행률 {pct}%</span>
            <h1>{row.goal}</h1>
            <p>🎯 기한 {row.deadline} · 하루 {row.hours_per_day}시간</p>
          </header>

          {error && (
            <div className="demo-banner" style={{ marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          <div className="results">
            <div className="card">
              <div className="progress">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="summary" style={{ marginTop: 12 }}>
                {row.result.summary}
              </p>
            </div>

            {row.result.milestones?.length > 0 && (
              <div className="card">
                <h2 className="section-title">중간 목표 (마일스톤)</h2>
                {row.result.milestones.map((m, i) => (
                  <div className="milestone" key={i}>
                    <span className="dot" />
                    <div>
                      <div className="m-title">{m.title}</div>
                      <div className="m-date">🎯 {m.targetDate}</div>
                      <div className="m-desc">{m.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {reviewItems.length > 0 && (
              <div className="card">
                <h2 className="section-title">🔁 복습이 필요한 단원 · {reviewItems.length}개</h2>
                <p className="save-note" style={{ marginTop: 0, marginBottom: 12 }}>
                  &quot;어려움&quot; 이상으로 답한 항목이에요. 필요하면 오늘 캘린더에 복습
                  일정으로 바로 추가할 수 있어요.
                </p>
                {reviewItems.map((it) => (
                  <div className="review-row" key={it.index}>
                    <span className={`diff-badge ${DIFF_BADGE_CLASS[it.level]}`}>{it.level}</span>
                    <div className="review-body">
                      <div className="review-title">{it.title}</div>
                      <div className="review-date">{it.date}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={reviewBusyIndex === it.index || reviewAdded.has(it.index)}
                      onClick={() => addReviewToday(it.index)}
                    >
                      {reviewAdded.has(it.index)
                        ? "✅ 추가됨"
                        : reviewBusyIndex === it.index
                          ? "추가 중…"
                          : "오늘 복습 추가"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {row.result.dailyPlan?.length > 0 && (
              <div className="card">
                <h2 className="section-title">
                  일자별 실행 계획 · {done.size}/{total} 완료
                </h2>
                {row.result.dailyPlan.map((d, i) => {
                  const parts = formatDateParts(d.date);
                  const checked = done.has(i);
                  const isToday = d.date === todayISO();
                  const level = difficulty[i];
                  return (
                    <div key={i}>
                      <label
                        className={`day day-check${checked ? " done" : ""}${
                          isToday ? " today" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onCheckboxChange(i, checked)}
                        />
                        <div className="d-date">
                          <div className="dnum">{parts.num}</div>
                          <div className="dmon">{parts.mon}</div>
                        </div>
                        <div>
                          <div className="d-title">
                            {d.title}
                            {isToday && <span className="today-tag">오늘</span>}
                            {level && (
                              <span className={`diff-badge sm ${DIFF_BADGE_CLASS[level]}`}>
                                {level}
                              </span>
                            )}
                          </div>
                          <div className="d-detail">{d.detail}</div>
                          <span className="d-min">⏱ 약 {d.estimatedMinutes}분</span>
                        </div>
                      </label>
                      {pendingIndex === i && (
                        <DifficultyPrompt
                          onSelect={(level) => complete(i, level)}
                          onCancel={() => setPendingIndex(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {row.result.dailyPlan?.length > 0 && (
              <div className="card">
                <h2 className="section-title">📅 캘린더에 일정으로 등록</h2>
                <p className="save-note" style={{ marginTop: 0, marginBottom: 12 }}>
                  일자별 계획을 매일 정해진 시각부터 캘린더 일정으로 만들어드려요.
                  이미 등록된 날짜는 건너뜁니다.
                </p>
                <div className="row">
                  <div className="field">
                    <label htmlFor="cal-start">매일 시작 시간</label>
                    <input
                      id="cal-start"
                      type="time"
                      value={calStartTime}
                      onChange={(e) => setCalStartTime(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={handlePushToCalendar}
                  disabled={calState === "pushing"}
                >
                  {calState === "pushing" ? (
                    <>
                      <span className="spinner" style={{ borderColor: "var(--border)", borderTopColor: "var(--brand)" }} />{" "}
                      등록 중…
                    </>
                  ) : (
                    <>📅 캘린더로 옮기기</>
                  )}
                </button>
                {calState === "done" && <p className="save-ok" style={{ marginTop: 10 }}>{calMsg}</p>}
                {calState === "error" && <p className="error">{calMsg}</p>}
              </div>
            )}

            {row.result.examNotes && (
              <div className="card">
                <h2 className="section-title">🤖 AI 공부법 코멘트</h2>
                <p className="summary">{row.result.examNotes.overallStrategy}</p>
                {row.result.examNotes.subjectTips?.length > 0 && (
                  <>
                    <h3 className="tip-h">과목별</h3>
                    {row.result.examNotes.subjectTips.map((x, i) => (
                      <div className="tip" key={i}>
                        <b>{x.subject}</b> {x.tip}
                      </div>
                    ))}
                  </>
                )}
                {row.result.examNotes.stageTips?.length > 0 && (
                  <>
                    <h3 className="tip-h">단계별</h3>
                    {row.result.examNotes.stageTips.map((x, i) => (
                      <div className="tip" key={i}>
                        <b>{x.step}</b> {x.tip}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {row.result.encouragement && (
              <div className="encourage">{row.result.encouragement}</div>
            )}
          </div>
        </>
      )}

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}
