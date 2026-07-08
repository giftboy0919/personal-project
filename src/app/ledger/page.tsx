"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import type { TransactionRow } from "@/lib/types";

const won = (n: number) => n.toLocaleString("ko-KR") + "원";
function thisMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}
function monthBounds(ym: string) {
  const start = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const end = new Date(y, m, 0).toISOString().slice(0, 10); // 말일
  return { start, end };
}

export default function LedgerPage() {
  const { session, loading: authLoading } = useAuth();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<"expense" | "income">("expense");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    const { start, end } = monthBounds(month);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    setRows((data as TransactionRow[]) ?? []);
    setLoading(false);
  }, [month, session]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTxn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) return;
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      date,
      type,
      amount: amt,
      category: category.trim() || null,
      memo: memo.trim() || null,
    });
    setBusy(false);
    if (!error) {
      setAmount("");
      setCategory("");
      setMemo("");
      // 추가한 거래가 현재 보고 있는 달이면 목록 갱신
      if (date.startsWith(month)) load();
      else setMonth(date.slice(0, 7));
    }
  }

  async function del(id: string) {
    if (!supabase) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("transactions").delete().eq("id", id);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <div className="card">
          <p className="save-note">가계부를 쓰려면 Supabase 연결(로그인)이 필요합니다.</p>
        </div>
      </main>
    );
  }
  if (authLoading) return null;

  const income = rows.filter((r) => r.type === "income").reduce((a, b) => a + Number(b.amount), 0);
  const expense = rows.filter((r) => r.type === "expense").reduce((a, b) => a + Number(b.amount), 0);

  return (
    <main className="page">
      <header className="hero">
        <span className="badge">가계부</span>
        <h1>수입 · 지출 기록</h1>
      </header>

      <form className="card" onSubmit={addTxn}>
        <div className="seg">
          <button
            type="button"
            className={`seg-btn${type === "expense" ? " active expense" : ""}`}
            onClick={() => setType("expense")}
          >
            지출
          </button>
          <button
            type="button"
            className={`seg-btn${type === "income" ? " active income" : ""}`}
            onClick={() => setType("income")}
          >
            수입
          </button>
        </div>
        <div className="row">
          <div className="field">
            <label>날짜</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>금액 <span className="hint">(원)</span></label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>분류 <span className="hint">(선택)</span></label>
            <input placeholder="식비 / 교통 / 월급 …" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="field">
            <label>메모 <span className="hint">(선택)</span></label>
            <input placeholder="점심 김밥" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : "기록 추가"}
        </button>
      </form>

      <div className="results">
        <div className="card">
          <div className="card-head">
            <h2 className="section-title">월별 내역</h2>
            <input
              className="month-input"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || thisMonth())}
            />
          </div>
          <div className="ledger-summary big">
            <div><span className="ls-label">수입</span><span className="amount income">+{won(income)}</span></div>
            <div><span className="ls-label">지출</span><span className="amount expense">-{won(expense)}</span></div>
            <div><span className="ls-label">합계</span>
              <span className={`amount ${income - expense >= 0 ? "income" : "expense"}`}>
                {income - expense >= 0 ? "+" : "-"}{won(Math.abs(income - expense))}
              </span>
            </div>
          </div>

          {loading ? (
            <p className="save-note">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="empty">이 달의 기록이 없어요.</p>
          ) : (
            rows.map((r) => (
              <div className="txn-row full" key={r.id}>
                <span className="txn-date">{r.date.slice(5)}</span>
                <span className="txn-cat">{r.category || (r.type === "income" ? "수입" : "지출")}</span>
                <span className="txn-memo">{r.memo}</span>
                <span className={`amount ${r.type}`}>
                  {r.type === "income" ? "+" : "-"}{won(Number(r.amount))}
                </span>
                <button className="task-del" onClick={() => del(r.id)} aria-label="삭제">✕</button>
              </div>
            ))
          )}
        </div>
      </div>

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}
