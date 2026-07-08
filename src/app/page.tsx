"use client";

import { useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { PlanRequestBody, PlanResult } from "@/lib/types";

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateParts(iso: string): { num: string; mon: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { num: "–", mon: iso };
  return {
    num: String(d.getDate()),
    mon: `${d.getMonth() + 1}월`,
  };
}

export default function Home() {
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

  function update<K extends keyof PlanRequestBody>(key: K, value: PlanRequestBody[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSaveState("idle");

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
      if (!res.ok) {
        throw new Error(data?.error || "계획 생성에 실패했습니다.");
      }
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
    const { error: dbError } = await supabase.from("plans").insert({
      goal: form.goal,
      deadline: form.deadline,
      current_level: form.currentLevel,
      hours_per_day: form.hoursPerDay,
      result, // jsonb 컬럼에 통째로 저장
    });
    setSaveState(dbError ? "error" : "saved");
    if (dbError) console.error("[save] Supabase insert 실패:", dbError);
  }

  return (
    <main className="page">
      <header className="hero">
        <span className="badge">통합 라이프 대시보드 · MVP</span>
        <h1>AI 목표 플래너</h1>
        <p>큰 목표를 입력하면, 오늘부터 기한까지 하루 단위 실행 계획으로 쪼개드려요.</p>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="goal">목표 <span className="hint">달성하고 싶은 큰 목표</span></label>
          <input
            id="goal"
            placeholder="예: 정보처리기사 필기 합격 / 토익 800점 / 포트폴리오 웹사이트 완성"
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
            placeholder="예: 전공 비전공자, 관련 개념은 거의 처음. 평일 저녁 위주로 공부 가능."
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
                  <span className="save-ok">Supabase에 저장되었습니다.</span>
                )}
                {saveState === "error" && (
                  <span className="error">저장 실패 — 콘솔을 확인하세요.</span>
                )}
              </div>
            ) : (
              <p className="save-note">
                Supabase 환경변수(<code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>)를 설정하면 계획을 저장할 수
                있습니다.
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="footer">
        Made with Next.js · Powered by Claude · 통합 라이프 대시보드
      </footer>
    </main>
  );
}
