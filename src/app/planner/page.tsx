"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getSelectableSeries, templatesForSeries } from "@/lib/examData";
import { computeExamPlan } from "@/lib/examScheduler";
import type { PlanRequestBody, PlanResult } from "@/lib/types";

const TIER_OPTIONS = ["상위권 (고득점)", "중위권 (안정권)", "하위권 (과락 탈출)"];

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateParts(iso: string): { num: string; mon: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { num: "–", mon: iso };
  return { num: String(d.getDate()), mon: `${d.getMonth() + 1}월` };
}

export default function PlannerPage() {
  const [form, setForm] = useState<PlanRequestBody>({
    goal: "",
    deadline: todayPlusDays(30),
    currentLevel: "",
    hoursPerDay: 2,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [savedId, setSavedId] = useState<string | null>(null);

  // ── 공무원 9급 시험 모드 ──
  const series = useMemo(() => getSelectableSeries(), []);
  const [mode, setMode] = useState<"free" | "exam">("free");
  const [seriesIdx, setSeriesIdx] = useState(0);
  const [tierIndex, setTierIndex] = useState(1); // 기본 중위권
  const [examDeadline, setExamDeadline] = useState(todayPlusDays(90));
  const [examHours, setExamHours] = useState(4);
  const [notesLoading, setNotesLoading] = useState(false);

  function update<K extends keyof PlanRequestBody>(key: K, value: PlanRequestBody[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleExamSubmit(e: React.FormEvent) {
    e.preventDefault();
    const s = series[seriesIdx];
    if (!s) return;
    setError(null);
    setResult(null);
    setSaveState("idle");
    setSavedId(null);

    const tierLabel = ["상위권", "중위권", "하위권"][tierIndex];
    let plan;
    try {
      plan = computeExamPlan({
        templates: templatesForSeries(s),
        jobSeriesLabel: s.key,
        tierIndex,
        deadline: examDeadline,
        hoursPerDay: examHours,
        todayISO: new Date().toISOString().slice(0, 10),
      });
      // 저장에 쓰이도록 form 메타도 채워둔다
      setForm({
        goal: `${s.key} 합격`,
        deadline: examDeadline,
        currentLevel: `${tierLabel} 목표`,
        hoursPerDay: examHours,
      });
      setResult(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "계획 생성에 실패했습니다.");
      return;
    }

    // 하이브리드: 규칙 기반 계획 위에 Claude 공부법 코멘트를 얹는다(선택/실패 시 스킵)
    try {
      setNotesLoading(true);
      const templates = templatesForSeries(s);
      const subjects = templates
        .filter((t) => t.subject?.name)
        .map((t) => ({
          name: t.subject!.name as string,
          stages: (t.stages ?? []).map((st) => ({ step: st.step, name: st.name })),
        }));
      const feasible = !plan.summary.includes("⚠️");
      const res = await fetch("/api/exam-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobSeries: s.key,
          tierLabel,
          deadline: examDeadline,
          hoursPerDay: examHours,
          feasible,
          subjects,
        }),
      });
      if (res.ok && res.status !== 204) {
        const notes = await res.json();
        setResult((prev) => (prev ? { ...prev, examNotes: notes } : prev));
      }
    } catch {
      /* 코멘트는 부가기능이므로 실패해도 무시 */
    } finally {
      setNotesLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSaveState("idle");
    setSavedId(null);

    if (!form.goal.trim()) {
      setError("목표를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "계획 생성에 실패했습니다.");
      setResult(data as PlanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!supabase || !result) return;
    setSaveState("saving");
    const { data, error: dbError } = await supabase
      .from("plans")
      .insert({
        goal: form.goal,
        deadline: form.deadline,
        current_level: form.currentLevel,
        hours_per_day: form.hoursPerDay,
        result,
      })
      .select("id")
      .single();
    if (dbError) {
      setSaveState("error");
      console.error("[save] Supabase insert 실패:", dbError);
    } else {
      setSavedId((data as { id: string }).id);
      setSaveState("saved");
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <span className="badge">AI 플래너</span>
        <h1>목표를 일간 계획으로</h1>
        <p>큰 목표를 입력하면, 오늘부터 기한까지 하루 단위 실행 계획으로 쪼개드려요.</p>
      </header>

      <div className="seg mode-seg">
        <button
          type="button"
          className={`seg-btn${mode === "free" ? " active" : ""}`}
          onClick={() => setMode("free")}
        >
          자유 목표
        </button>
        <button
          type="button"
          className={`seg-btn${mode === "exam" ? " active" : ""}`}
          onClick={() => setMode("exam")}
        >
          공무원 9급 시험
        </button>
      </div>

      {mode === "free" && (
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="goal">목표 <span className="hint">달성하고 싶은 큰 목표</span></label>
          <input
            id="goal"
            placeholder="예: 정보처리기사 필기 합격 / 토익 800점 / 포트폴리오 완성"
            value={form.goal}
            onChange={(e) => update("goal", e.target.value)}
          />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="deadline">목표 기한</label>
            <input
              id="deadline"
              type="date"
              value={form.deadline}
              min={todayPlusDays(1)}
              onChange={(e) => update("deadline", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="hours">하루 투자 가능 시간 <span className="hint">(시간)</span></label>
            <input
              id="hours"
              type="number"
              min={0.5}
              step={0.5}
              value={form.hoursPerDay}
              onChange={(e) => update("hoursPerDay", Number(e.target.value))}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="level">
            현재 수준 / 상황 <span className="hint">(선택 — 있으면 더 정확해져요)</span>
          </label>
          <textarea
            id="level"
            placeholder="예: 비전공자, 관련 개념은 거의 처음. 평일 저녁 위주로 공부 가능."
            value={form.currentLevel}
            onChange={(e) => update("currentLevel", e.target.value)}
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" /> AI가 계획을 짜는 중…
            </>
          ) : (
            <>✨ 일간 계획 만들기</>
          )}
        </button>

        {error && <p className="error">{error}</p>}
      </form>
      )}

      {mode === "exam" && (
      <form className="card" onSubmit={handleExamSubmit}>
        {series.length === 0 ? (
          <p className="save-note">사용 가능한 직렬 템플릿이 없습니다.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="series">응시 직렬</label>
              <select
                id="series"
                value={seriesIdx}
                onChange={(e) => setSeriesIdx(Number(e.target.value))}
              >
                {series.map((s, i) => (
                  <option key={s.key} value={i}>
                    {s.key} — {s.majors.join(" · ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>목표 등급</label>
              <div className="seg">
                {TIER_OPTIONS.map((lbl, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`seg-btn${tierIndex === i ? " active" : ""}`}
                    onClick={() => setTierIndex(i)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label htmlFor="exam-date">시험(목표) 날짜</label>
                <input
                  id="exam-date"
                  type="date"
                  value={examDeadline}
                  min={todayPlusDays(1)}
                  onChange={(e) => setExamDeadline(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="exam-hours">하루 공부 시간 <span className="hint">(시간)</span></label>
                <input
                  id="exam-hours"
                  type="number"
                  min={1}
                  step={0.5}
                  value={examHours}
                  onChange={(e) => setExamHours(Number(e.target.value))}
                />
              </div>
            </div>

            <button className="btn btn-primary" type="submit">
              📚 시험 역산 계획 만들기
            </button>
            <p className="save-note" style={{ marginTop: 12 }}>
              공통과목(국어·영어) + 전공 2과목의 문항수·난이도·기출 회독을 반영해 남은 기간으로
              역산합니다. (규칙 기반 — API 키 불필요)
            </p>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </form>
      )}

      {result && (
        <section className="results">
          {result.isDemo && (
            <div className="demo-banner">
              🟡 데모 데이터입니다. 서버에 <code>ANTHROPIC_API_KEY</code>를 설정하면
              실제 AI가 맞춤 계획을 생성합니다.
            </div>
          )}

          <div className="card">
            <h2 className="section-title">전략 요약</h2>
            <p className="summary">{result.summary}</p>
          </div>

          {result.milestones?.length > 0 && (
            <div className="card">
              <h2 className="section-title">중간 목표 (마일스톤)</h2>
              {result.milestones.map((m, i) => (
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

          {result.dailyPlan?.length > 0 && (
            <div className="card">
              <h2 className="section-title">일자별 실행 계획</h2>
              {result.dailyPlan.map((d, i) => {
                const parts = formatDateParts(d.date);
                return (
                  <div className="day" key={i}>
                    <div className="d-date">
                      <div className="dnum">{parts.num}</div>
                      <div className="dmon">{parts.mon}</div>
                    </div>
                    <div>
                      <div className="d-title">{d.title}</div>
                      <div className="d-detail">{d.detail}</div>
                      <span className="d-min">⏱ 약 {d.estimatedMinutes}분</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {result.encouragement && (
            <div className="encourage">{result.encouragement}</div>
          )}

          {notesLoading && !result.examNotes && (
            <div className="card">
              <p className="save-note">
                <span
                  className="spinner"
                  style={{ borderColor: "var(--border)", borderTopColor: "var(--brand)" }}
                />{" "}
                AI 공부법 코멘트 생성 중…
              </p>
            </div>
          )}

          {result.examNotes && (
            <div className="card">
              <h2 className="section-title">🤖 AI 공부법 코멘트</h2>
              <p className="summary">{result.examNotes.overallStrategy}</p>
              {result.examNotes.subjectTips?.length > 0 && (
                <>
                  <h3 className="tip-h">과목별</h3>
                  {result.examNotes.subjectTips.map((x, i) => (
                    <div className="tip" key={i}>
                      <b>{x.subject}</b> {x.tip}
                    </div>
                  ))}
                </>
              )}
              {result.examNotes.stageTips?.length > 0 && (
                <>
                  <h3 className="tip-h">단계별</h3>
                  {result.examNotes.stageTips.map((x, i) => (
                    <div className="tip" key={i}>
                      <b>{x.step}</b> {x.tip}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <div className="card">
            <h2 className="section-title">계획 저장</h2>
            {isSupabaseConfigured ? (
              <div className="save-row">
                <button
                  className="btn btn-ghost"
                  onClick={handleSave}
                  disabled={saveState === "saving" || saveState === "saved"}
                >
                  {saveState === "saving"
                    ? "저장 중…"
                    : saveState === "saved"
                      ? "✅ 저장됨"
                      : "💾 이 계획 저장하기"}
                </button>
                {saveState === "saved" && (
                  <span className="save-ok">
                    저장되었습니다.{" "}
                    {savedId && (
                      <Link href={`/plans/${savedId}`}>계획 열어 체크하기 →</Link>
                    )}
                  </span>
                )}
                {saveState === "error" && (
                  <span className="error">저장 실패 — 콘솔을 확인하세요.</span>
                )}
              </div>
            ) : (
              <p className="save-note">
                로그인(Supabase 설정) 후 계획을 저장할 수 있습니다.
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="footer">Powered by Claude · 통합 라이프 대시보드</footer>
    </main>
  );
}
