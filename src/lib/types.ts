// 앱 전체에서 공유하는 타입 정의.
// 프론트(page.tsx)와 API 라우트(api/plan/route.ts)가 같은 계약을 사용하도록 여기 한 곳에 모은다.

/** 사용자가 폼에 입력하는 값 */
export interface PlanRequestBody {
  goal: string; // 예: "정보처리기사 필기 합격"
  deadline: string; // 목표 기한 YYYY-MM-DD
  currentLevel: string; // 현재 수준/상황 (자유서술)
  hoursPerDay: number; // 하루 투자 가능 시간(시간 단위)
}

/** 중간 목표(마일스톤) */
export interface Milestone {
  title: string;
  targetDate: string; // YYYY-MM-DD
  description: string;
}

/** 하루치 실행 계획 */
export interface DailyTask {
  date: string; // YYYY-MM-DD
  title: string;
  detail: string;
  estimatedMinutes: number;
}

/** AI가 돌려주는 전체 결과 */
export interface PlanResult {
  summary: string; // 전략 한두 문장 요약
  milestones: Milestone[];
  dailyPlan: DailyTask[];
  encouragement: string; // 응원 한마디
  isDemo?: boolean; // API 키 없이 데모 데이터로 생성된 경우 true
}

/** Supabase `plans` 테이블의 한 행 */
export interface SavedPlanRow {
  id: string;
  created_at: string;
  goal: string;
  deadline: string;
  current_level: string | null;
  hours_per_day: number;
  result: PlanResult;
  done_tasks: number[]; // 완료 체크한 dailyPlan 항목 인덱스
}

// ── 코어 엔티티 (공통 date 축으로 통합 대시보드를 구성) ──────

/** 가계부 항목 */
export interface TransactionRow {
  id: string;
  user_id: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  category: string | null;
  memo: string | null;
  created_at: string;
}

/** 시간표 항목 */
export interface ScheduleItemRow {
  id: string;
  user_id: string;
  date: string;
  start_time: string | null; // "HH:MM"
  end_time: string | null;
  title: string;
  location: string | null;
  created_at: string;
}

/** 개별 할 일(플래너) */
export interface TaskRow {
  id: string;
  user_id: string;
  date: string;
  title: string;
  done: boolean;
  created_at: string;
}
