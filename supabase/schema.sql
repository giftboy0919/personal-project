-- ─────────────────────────────────────────────────────────────
-- Supabase 스키마: 저장된 AI 목표 계획
-- 사용법: Supabase 프로젝트 > SQL Editor 에 아래 내용을 붙여넣고 실행(Run).
-- ─────────────────────────────────────────────────────────────

create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  goal          text not null,
  deadline      date not null,
  current_level text,
  hours_per_day numeric not null,
  result        jsonb not null           -- AI가 만든 계획 전체(summary/milestones/dailyPlan/…)를 통째로 보관
);

-- RLS(행 수준 보안) 활성화.
alter table public.plans enable row level security;

-- ⚠️ MVP용 정책: 로그인 없이 anon 키로 누구나 insert/select 가능하게 열어둔다.
--    실제 서비스로 확장할 때는 반드시 사용자 인증(auth.uid())을 붙이고 아래 정책을 좁혀야 한다.
--    예) user_id uuid 컬럼을 추가하고 "auth.uid() = user_id" 로 제한.
drop policy if exists "anon can insert plans" on public.plans;
create policy "anon can insert plans"
  on public.plans for insert
  to anon
  with check (true);

drop policy if exists "anon can read plans" on public.plans;
create policy "anon can read plans"
  on public.plans for select
  to anon
  using (true);
