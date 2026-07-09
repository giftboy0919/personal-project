-- ─────────────────────────────────────────────────────────────
-- 통합 라이프 대시보드 · Supabase 스키마 (사용자별 로그인 버전)
-- 사용법: Supabase 프로젝트 > SQL Editor 에 전체 붙여넣고 실행(Run). 여러 번 실행해도 안전.
--
-- 핵심 설계: 3개 코어 엔티티(transactions=가계부, schedule_items=시간표, tasks=플래너)가
--            공통으로 date 필드를 가진다 → 이 공유 date 축이 통합 홈 대시보드를 가능하게 함.
-- 보안: 모든 테이블 RLS 활성화, "본인(auth.uid()) 행만" 접근 가능.
-- ─────────────────────────────────────────────────────────────

-- ── 1. plans (AI 목표 계획) ─────────────────────────────────
create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  goal          text not null,
  deadline      date not null,
  current_level text,
  hours_per_day numeric not null,
  result        jsonb not null,
  done_tasks    jsonb not null default '[]'::jsonb,
  difficulty    jsonb not null default '{}'::jsonb
);
alter table public.plans add column if not exists done_tasks jsonb not null default '[]'::jsonb;
alter table public.plans add column if not exists user_id uuid references auth.users(id) default auth.uid();
-- difficulty: dailyPlan 인덱스(문자열 키) → "매우 어려움"|"어려움"|"보통"|"쉬움"|"매우 쉬움"
-- 완료 체크 시 함께 기록되며, 복습이 필요한 단원을 자동으로 뽑아내는 데 쓰인다.
alter table public.plans add column if not exists difficulty jsonb not null default '{}'::jsonb;

-- ── 2. transactions (가계부) ────────────────────────────────
create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) default auth.uid(),
  date       date not null,
  type       text not null check (type in ('income', 'expense')),
  amount     numeric not null check (amount >= 0),
  category   text,
  memo       text,
  created_at timestamptz not null default now()
);

-- ── 3. schedule_items (시간표) ──────────────────────────────
create table if not exists public.schedule_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) default auth.uid(),
  date       date not null,
  start_time time,
  end_time   time,
  title      text not null,
  location   text,
  created_at timestamptz not null default now()
);

-- ── 4. tasks (플래너 · 개별 할 일) ──────────────────────────
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) default auth.uid(),
  date       date not null,
  title      text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── RLS: 모든 테이블 본인 행만 ──────────────────────────────
alter table public.plans          enable row level security;
alter table public.transactions   enable row level security;
alter table public.schedule_items enable row level security;
alter table public.tasks          enable row level security;

-- 이전(anon) 정책이 있으면 제거
drop policy if exists "anon can insert plans" on public.plans;
drop policy if exists "anon can read plans"   on public.plans;
drop policy if exists "anon can update plans" on public.plans;

-- 각 테이블에 "본인 행 전체 권한(select/insert/update/delete)" 정책 하나씩
drop policy if exists "own plans" on public.plans;
create policy "own plans" on public.plans for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own schedule_items" on public.schedule_items;
create policy "own schedule_items" on public.schedule_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 조회 성능용 인덱스
create index if not exists idx_transactions_user_date   on public.transactions (user_id, date);
create index if not exists idx_schedule_items_user_date on public.schedule_items (user_id, date);
create index if not exists idx_tasks_user_date          on public.tasks (user_id, date);
create index if not exists idx_plans_user               on public.plans (user_id, created_at desc);
