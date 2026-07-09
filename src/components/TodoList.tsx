"use client";

// 특정 날짜의 할 일을 보여주는 공용 컴포넌트.
// 두 출처를 합쳐서 보여준다: (1) 수동으로 추가한 tasks, (2) 저장한 AI 계획의 그날 dailyPlan 항목.
// 계획 항목 체크 시 plans.done_tasks 를 갱신하므로 /plans/[id] 진행률과 항상 동기화된다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { SavedPlanRow, TaskRow } from "@/lib/types";

export default function TodoList({ date }: { date: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [plans, setPlans] = useState<SavedPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [t, p] = await Promise.all([
      supabase.from("tasks").select("*").eq("date", date).order("created_at"),
      supabase.from("plans").select("id, goal, result, done_tasks"),
    ]);
    setTasks((t.data as TaskRow[]) ?? []);
    setPlans((p.data as SavedPlanRow[]) ?? []);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const planItems = useMemo(() => {
    const items: {
      planId: string;
      goal: string;
      index: number;
      title: string;
      done: boolean;
    }[] = [];
    for (const p of plans) {
      (p.result?.dailyPlan ?? []).forEach((d, i) => {
        if (d.date === date) {
          items.push({
            planId: p.id,
            goal: p.goal,
            index: i,
            title: d.title,
            done: (p.done_tasks ?? []).includes(i),
          });
        }
      });
    }
    return items;
  }, [plans, date]);

  async function togglePlanItem(planId: string, index: number) {
    if (!supabase) return;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const set = new Set(plan.done_tasks ?? []);
    if (set.has(index)) set.delete(index);
    else set.add(index);
    const next = [...set].sort((a, b) => a - b);
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, done_tasks: next } : p)));
    await supabase.from("plans").update({ done_tasks: next }).eq("id", planId);
  }

  async function toggleTask(task: TaskRow) {
    if (!supabase) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
  }

  async function deleteTask(id: string) {
    if (!supabase) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !newTask.trim()) return;
    const title = newTask.trim();
    setNewTask("");
    const { data } = await supabase
      .from("tasks")
      .insert({ date, title })
      .select("*")
      .single();
    if (data) setTasks((prev) => [...prev, data as TaskRow]);
  }

  const doneCount = tasks.filter((t) => t.done).length + planItems.filter((p) => p.done).length;
  const totalCount = tasks.length + planItems.length;

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="section-title">
          ✅ 할 일 · {doneCount}/{totalCount}
        </h2>
      </div>

      {loading ? (
        <p className="save-note">불러오는 중…</p>
      ) : (
        <>
          {tasks.map((t) => (
            <div className={`task-row${t.done ? " done" : ""}`} key={t.id}>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} />
              <span className="task-title">{t.title}</span>
              <button className="task-del" onClick={() => deleteTask(t.id)} aria-label="삭제">
                ✕
              </button>
            </div>
          ))}

          {planItems.length > 0 && (
            <div className="plan-items">
              <div className="plan-items-h">📋 계획에서 온 항목</div>
              {planItems.map((it) => (
                <div
                  className={`task-row${it.done ? " done" : ""}`}
                  key={`${it.planId}-${it.index}`}
                >
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={() => togglePlanItem(it.planId, it.index)}
                  />
                  <span className="task-title">
                    {it.title}
                    <span className="plan-src">· {it.goal}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {tasks.length === 0 && planItems.length === 0 && (
            <p className="empty">할 일이 없어요. 아래에 추가하거나 계획을 저장해보세요.</p>
          )}
        </>
      )}

      <form onSubmit={addTask} className="task-add">
        <input
          placeholder="+ 할 일 추가 후 Enter"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
        />
      </form>
    </div>
  );
}
