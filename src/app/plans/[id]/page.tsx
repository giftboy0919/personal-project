"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { SavedPlanRow } from "@/lib/types";

function formatDateParts(iso: string): { num: string; mon: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { num: "–", mon: iso };
  return { num: String(d.getDate()), mon: `${d.getMonth() + 1}월` };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [row, setRow] = useState<SavedPlanRow | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        }
        setLoading(false);
      });
  }, [id]);

  async function toggle(index: number) {
    if (!supabase) return;
    const next = new Set(done);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setDone(next); // 낙관적 업데이트

    setSaving(true);
    const { error: dbError } = await supabase
      .from("plans")
      .update({ done_tasks: Array.from(next).sort((a, b) => a - b) })
      .eq("id", id);
    setSaving(false);
    if (dbError) {
      setError("저장 실패: " + dbError.message);
      setDone(done); // 롤백
    }
  }

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

            {row.result.dailyPlan?.length > 0 && (
              <div className="card">
                <h2 className="section-title">
                  일자별 실행 계획 · {done.size}/{total} 완료
                </h2>
                {row.result.dailyPlan.map((d, i) => {
                  const parts = formatDateParts(d.date);
                  const checked = done.has(i);
                  const isToday = d.date === todayISO();
                  return (
                    <label
                      className={`day day-check${checked ? " done" : ""}${
                        isToday ? " today" : ""
                      }`}
                      key={i}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(i)}
                      />
                      <div className="d-date">
                        <div className="dnum">{parts.num}</div>
                        <div className="dmon">{parts.mon}</div>
                      </div>
                      <div>
                        <div className="d-title">
                          {d.title}
                          {isToday && <span className="today-tag">오늘</span>}
                        </div>
                        <div className="d-detail">{d.detail}</div>
                        <span className="d-min">⏱ 약 {d.estimatedMinutes}분</span>
                      </div>
                    </label>
                  );
                })}
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
