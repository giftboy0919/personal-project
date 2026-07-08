# 통합 라이프 대시보드 · AI 목표 플래너 (웹 MVP)

큰 목표를 입력하면 **AI(Claude)가 오늘부터 기한까지 하루 단위 실행 계획으로 역산해서 쪼개주는** 웹 앱입니다.
(기획 문서의 핵심 "AI 전략 = 목표를 일간 단위로 역산해 배분"을 웹으로 먼저 구현한 MVP)

- **프론트엔드**: Next.js (App Router, TypeScript) → **Vercel** 배포
- **AI**: Claude API (`ANTHROPIC_API_KEY`는 서버 라우트에서만 사용 → 브라우저에 노출 안 됨)
- **백엔드/저장소**: **Supabase** (Postgres) — 만든 계획을 저장

> 💡 **키가 하나도 없어도 실행됩니다.** `ANTHROPIC_API_KEY`가 없으면 자동으로 "데모 계획"을 보여주고,
> Supabase 키가 없으면 "저장" 기능만 꺼집니다. 나중에 Vercel에 키를 넣으면 그대로 실기능으로 전환됩니다.

---

## 📁 구조

```
life-dashboard/
├── src/
│   ├── app/
│   │   ├── page.tsx            # 메인 UI(입력 폼 + 결과 화면)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/plan/route.ts   # POST /api/plan — Claude 호출(서버 전용)
│   └── lib/
│       ├── types.ts            # 공유 타입
│       ├── planPrompt.ts       # 시스템 프롬프트 + 출력 스키마 + 데모 계획
│       └── supabaseClient.ts   # 브라우저용 Supabase 클라이언트
├── supabase/schema.sql         # 저장 테이블(plans) 정의
├── .env.local.example          # 환경변수 예시
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
