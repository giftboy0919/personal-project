# 통합 라이프 대시보드 (웹 MVP)

**가계부 · 시간표 · AI 플래너를 한 화면에서** 관리하는 웹 앱. 3개 코어 엔티티가 공통 `date` 필드를
공유해 "오늘" 화면에서 일정·할 일·지출을 한눈에 봅니다. (기획 문서의 통합 대시보드 설계를 웹으로 구현)

- **프론트엔드**: Next.js (App Router, TypeScript) → **Vercel** 배포
- **로그인/저장소**: **Supabase** (Auth + Postgres, 사용자별 RLS)
- **AI**: Claude API (`ANTHROPIC_API_KEY`는 서버 라우트에서만 사용 → 브라우저에 노출 안 됨)

### 주요 기능
- **오늘 대시보드(`/`)** — 날짜별 일정·할 일(체크)·지출을 한 화면에
- **가계부(`/ledger`)** — 수입/지출 기록, 월별 합계
- **시간표(`/schedule`)** — 일자별 일정 관리
- **AI 플래너(`/planner`)** — ① 자유 목표: 목표·기한·시간 입력 → Claude가 일간 계획 생성
  ② **공무원 9급 시험 모드**: 직렬·목표등급 선택 → 문항수×난이도×기출 회독을 반영해 **규칙 기반 역산**으로 일별 캘린더 생성 (API 키 불필요)
- **저장한 계획(`/plans`, `/plans/[id]`)** — 계획 저장 + 일자별 체크박스·진행률

> 💡 **키가 없어도 실행됩니다.** Supabase 미설정 시 "데모 모드"(로그인 없이 AI 플래너 체험),
> `ANTHROPIC_API_KEY` 미설정 시 자유목표는 데모 계획으로 폴백. 나중에 Vercel에 키를 넣으면 실기능 전환.

---

## 📁 구조

```
life-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 오늘 통합 대시보드
│   │   ├── ledger/page.tsx       # 가계부
│   │   ├── schedule/page.tsx     # 시간표
│   │   ├── planner/page.tsx      # AI 플래너(자유목표 + 공무원 시험모드)
│   │   ├── plans/                # 저장한 계획 목록 + 상세(체크박스)
│   │   ├── layout.tsx / globals.css
│   │   └── api/plan/route.ts     # POST /api/plan — Claude 호출(서버 전용)
│   ├── components/               # AppShell(내비/인증게이트), LoginForm
│   ├── lib/
│   │   ├── auth.tsx              # Supabase Auth 세션 컨텍스트
│   │   ├── supabaseClient.ts     # 브라우저 Supabase 클라이언트
│   │   ├── planPrompt.ts         # 자유목표 AI 프롬프트/스키마/데모
│   │   ├── examData.ts           # 시험 템플릿 레지스트리(직렬→과목)
│   │   └── examScheduler.ts      # 규칙 기반 역산 스케줄러
│   └── data/exam/*.json          # 공무원 9급 직렬별 커리큘럼 템플릿(번들)
├── supabase/schema.sql           # plans/transactions/schedule_items/tasks + RLS
├── .env.local.example
└── ...
```

---

## 🚀 1. 로컬에서 먼저 실행해보기

```bash
cd life-dashboard
npm install
cp .env.local.example .env.local   # (선택) 키를 채우면 실제 AI/저장 동작
npm run dev
```

→ 브라우저에서 http://localhost:3000 열기. 키가 없어도 데모로 동작합니다.

**실제 AI를 쓰려면** `.env.local`에 `ANTHROPIC_API_KEY`를 넣으세요
(발급: https://console.anthropic.com/).

---

## 🐙 2. GitHub에 올리기

이 폴더에는 이미 git이 초기화되어 있고 첫 커밋이 되어 있습니다. GitHub에 새 repo를 만든 뒤:

```bash
# GitHub에서 빈 저장소(life-dashboard)를 먼저 만든 다음, 그 주소로:
git remote add origin https://github.com/<your-id>/life-dashboard.git
git branch -M main
git push -u origin main
```

> `gh` CLI가 있으면 한 번에: `gh repo create life-dashboard --public --source=. --push`

---

## ▲ 3. Vercel에 배포하기

1. https://vercel.com → **New Project** → 방금 올린 GitHub repo(`life-dashboard`) 선택
2. 프레임워크는 자동으로 **Next.js**로 잡힙니다. 그대로 **Deploy**.
3. 배포 후 **Settings → Environment Variables**에 아래를 추가하고 **Redeploy**:

| 이름 | 값 | 노출 |
|------|-----|------|
| `ANTHROPIC_API_KEY` | Claude API 키 | 서버 전용(브라우저에 안 나감) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | 공개 |

> `NEXT_PUBLIC_` 접두사가 붙은 값만 브라우저로 전달됩니다. `ANTHROPIC_API_KEY`는 접두사가 없으니 **서버에서만** 읽혀 안전합니다.

---

## 🗄️ 4. Supabase 백엔드 붙이기

1. https://supabase.com → 새 프로젝트 생성
2. **SQL Editor**에 [`supabase/schema.sql`](supabase/schema.sql) 내용을 붙여넣고 **Run** → `plans` 테이블 생성
3. **Settings → API**에서 `Project URL`과 `anon public` 키를 복사
4. 위 3번(Vercel 환경변수)에 넣고 Redeploy

이제 결과 화면의 **"이 계획 저장하기"** 버튼이 활성화되어 Supabase에 저장됩니다.

> ⚠️ 현재 `schema.sql`의 RLS 정책은 MVP용으로 **로그인 없이 anon 키로 누구나 읽기/쓰기** 가능하게 열려 있습니다.
> 실제 서비스로 갈 때는 Supabase Auth를 붙이고 `user_id` 기준으로 정책을 좁히세요.

---

## 🔒 보안 메모

- `.env.local`, `.env*`는 `.gitignore`에 포함되어 **절대 커밋되지 않습니다.**
- Claude 키는 `src/app/api/plan/route.ts`(서버)에서만 사용합니다. 클라이언트 코드에는 들어가지 않습니다.

---

## 🧭 다음 확장 아이디어

- 저장된 계획 목록 페이지(`/plans`) + 오늘 할 일 체크박스
- Supabase Auth 로그인 → 사용자별 계획 분리
- 기획서의 나머지 두 모듈(가계부 `Transaction` / 시간표 `ScheduleItem`)을 같은 `date` 축으로 통합한 홈 대시보드
