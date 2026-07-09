"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    setMsg(null);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setErr(error.message);
      else
        setMsg(
          "가입 완료! 이메일 인증이 켜져 있다면 받은 메일의 링크를 눌러 확인 후 로그인하세요.",
        );
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
      // 성공 시 onAuthStateChange 가 세션을 갱신해 자동으로 앱 화면으로 전환됨
    }
    setBusy(false);
  }

  return (
    <main className="page">
      <header className="hero">
        <span className="badge">통합 라이프 대시보드</span>
        <h1>{mode === "signin" ? "로그인" : "회원가입"}</h1>
        <p>가계부 · 캘린더 · 플래너를 한 화면에서 관리하세요.</p>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호 <span className="hint">(6자 이상)</span></label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : mode === "signin" ? "로그인" : "가입하기"}
        </button>

        {err && <p className="error">{err}</p>}
        {msg && <p className="save-ok" style={{ marginTop: 12 }}>{msg}</p>}

        <p className="save-note" style={{ marginTop: 16, textAlign: "center" }}>
          {mode === "signin" ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
          <button
            type="button"
            className="linklike"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setErr(null);
              setMsg(null);
            }}
          >
            {mode === "signin" ? "회원가입" : "로그인"}
          </button>
        </p>
      </form>

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}
