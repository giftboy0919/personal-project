// 공무원 9급 시험 · 규칙 기반 역산 스케줄러.
// 문항수 × (목표등급별) 문항당 시간 × 회독배수 → 총 소요시간 → 남은 일수로 역산해 일별 캘린더 생성.
// 순수 함수라 API 키 없이 브라우저에서 바로 동작한다.
import type { PlanResult, Milestone, DailyTask } from "./types";

// ── 템플릿 타입(느슨하게: 과목마다 세부 키가 조금씩 다름) ──
export interface QBRow {
  stage: string;
  domain: string;
  [k: string]: string | number | undefined; // "하"/"중"/"상" 숫자 컬럼 포함
}
export interface ExamTierDef {
  tier: string;
  time_per_question_sec: Record<string, number>;
}
export interface ExamTemplate {
  subject?: { name?: string };
  job_series?: string;
  stages?: { step: string; name: string }[];
  difficulty_tiers?: { tiers?: ExamTierDef[] };
  daily_routine_addon?: { name?: string; daily_minutes?: Record<string, number> };
  master_question_bank?: { table?: QBRow[] };
}

const STEP_ORDER = ["STEP0", "STEP1", "STEP2", "STEP3", "STEP4"];
const TIER_LABELS = ["상위권", "중위권", "하위권"]; // index 0/1/2
const REVIEW_MULTIPLIER: Record<string, number> = { STEP2: 3 }; // 기출은 3회독 권장

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysInclusive(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

interface Chunk {
  subject: string;
  step: string;
  stepName: string;
  minutes: number; // 남은 소요(분)
  questions: number;
}

/** 한 과목 템플릿에서 목표등급(tierIndex)에 맞는 단계별 부하를 계산 */
function loadsForTemplate(t: ExamTemplate, tierIndex: number): Chunk[] {
  const tiers = t.difficulty_tiers?.tiers ?? [];
  const tier = tiers[tierIndex] ?? tiers[tiers.length - 1];
  const table = t.master_question_bank?.table ?? [];
  const subject = t.subject?.name ?? t.job_series ?? "과목";
  if (!tier || table.length === 0) return [];

  // time_per_question_sec 값을 순서대로 하/중/상 으로 사용
  const times = Object.values(tier.time_per_question_sec ?? {}).map(num);
  const tHa = times[0] || 60;
  const tJung = times[1] || 100;
  const tSang = times[2] || 150;

  const stepName: Record<string, string> = {};
  (t.stages ?? []).forEach((s) => (stepName[s.step] = s.name));

  const byStep = new Map<string, Chunk>();
  for (const row of table) {
    const ha = num(row["하"]);
    const jung = num(row["중"]);
    const sang = num(row["상"]);
    const q = ha + jung + sang;
    if (q === 0) continue;
    const mult = REVIEW_MULTIPLIER[row.stage] ?? 1;
    const minutes = ((ha * tHa + jung * tJung + sang * tSang) / 60) * mult;
    const cur = byStep.get(row.stage);
    if (cur) {
      cur.minutes += minutes;
      cur.questions += q * mult;
    } else {
      byStep.set(row.stage, {
        subject,
        step: row.stage,
        stepName: stepName[row.stage] ?? row.stage,
        minutes,
        questions: q * mult,
      });
    }
  }
  return [...byStep.values()];
}

export interface ExamPlanOptions {
  templates: ExamTemplate[]; // 이 시험의 과목 템플릿들(전공 + 공통)
  jobSeriesLabel: string;
  tierIndex: number; // 0=상위권,1=중위권,2=하위권
  deadline: string;
  hoursPerDay: number;
  todayISO: string;
}

export function computeExamPlan(opts: ExamPlanOptions): PlanResult {
  const { templates, jobSeriesLabel, tierIndex, deadline, hoursPerDay, todayISO } = opts;

  // 1) 과목별 단계 부하 수집
  const allChunks: Chunk[] = [];
  let routinePerDay = 0;
  const tierLabel = TIER_LABELS[tierIndex] ?? "중위권";
  const subjectNames = new Set<string>();

  for (const t of templates) {
    allChunks.push(...loadsForTemplate(t, tierIndex));
    if (t.subject?.name) subjectNames.add(t.subject.name);
    const dr = t.daily_routine_addon?.daily_minutes;
    if (dr) routinePerDay += num(dr[tierLabel]);
  }

  // 2) 단계(STEP) 우선 → 같은 단계 안에서 과목들을 함께 진행하도록 정렬
  const queue = [...allChunks].sort((a, b) => {
    const sa = STEP_ORDER.indexOf(a.step);
    const sb = STEP_ORDER.indexOf(b.step);
    return sa - sb;
  });

  const totalStudyMin = allChunks.reduce((s, c) => s + c.minutes, 0);
  const totalDays = daysInclusive(todayISO, deadline);
  const dayFull = Math.max(30, Math.round(hoursPerDay * 60));
  const dayStudy = Math.max(20, dayFull - routinePerDay); // 데일리 루틴 먼저 차감

  // 3) 일별 배분
  const dailyPlan: DailyTask[] = [];
  const stepLastDate: Record<string, string> = {};
  const MAX_DAYS = 120;
  let qi = 0; // queue index

  for (let day = 0; day < totalDays && day < MAX_DAYS; day++) {
    const date = addDays(todayISO, day);
    const isReview = (day + 1) % 7 === 0; // 주 1회 복습일

    if (isReview || qi >= queue.length) {
      const remainReview = qi < queue.length;
      dailyPlan.push({
        date,
        title: remainReview ? "복습 · 오답 정리" : "총정리 · 실전 점검",
        detail: remainReview
          ? "이번 주 학습한 내용 오답 복습 + 취약 단원 재점검."
          : "전 과목 총정리, 오답 노트 재복습, 실전 모의 점검.",
        estimatedMinutes: dayFull,
      });
      continue;
    }

    let remaining = dayStudy;
    const segs: string[] = [];
    let primary = "";
    while (remaining >= 15 && qi < queue.length) {
      const c = queue[qi];
      const take = Math.min(remaining, c.minutes);
      c.minutes -= take;
      remaining -= take;
      if (!primary) primary = `${c.subject} ${c.stepName}`;
      segs.push(`${c.subject} · ${c.stepName} ${Math.round(take)}분`);
      stepLastDate[c.step] = date;
      if (c.minutes < 1) qi++; // 이 청크 완료
      else break; // 하루치 다 씀
    }

    const used = dayStudy - remaining;
    if (routinePerDay > 0) segs.push(`영어 데일리보카 등 루틴 ${routinePerDay}분`);
    dailyPlan.push({
      date,
      title: primary || "학습",
      detail: segs.join(" · "),
      estimatedMinutes: Math.round(used + routinePerDay),
    });
  }

  // 4) 마일스톤(단계 완료일)
  const presentSteps = STEP_ORDER.filter((s) => allChunks.some((c) => c.step === s));
  const milestones: Milestone[] = presentSteps.map((step) => {
    const name =
      templates.map((t) => t.stages?.find((s) => s.step === step)?.name).find(Boolean) ??
      step;
    return {
      title: `${step} · ${name}`,
      targetDate: stepLastDate[step] ?? deadline,
      description: stepLastDate[step]
        ? `${step} 단계 학습 완료 목표일.`
        : `기간 내 배분 실패(물량 초과) — 이 단계는 축소가 필요합니다.`,
    };
  });

  // 5) 요약 + 응원
  const totalHours = Math.round(totalStudyMin / 60);
  const capacityHours = Math.round((dayStudy * totalDays) / 60);
  const shortfall = qi < queue.length;
  const summaryParts = [
    `${jobSeriesLabel} · ${tierLabel} 목표 기준으로 오늘(${todayISO})부터 ${deadline}까지 ${totalDays}일 계획입니다.`,
    `총 예상 학습량은 약 ${totalHours}시간(문항수×문항당 시간×기출 회독 반영), 하루 순수 학습 ${Math.round(dayStudy / 60 * 10) / 10}시간 기준 가용량은 약 ${capacityHours}시간입니다.`,
  ];
  if (shortfall) {
    summaryParts.push(
      `⚠️ 물량이 기간을 초과합니다(약 ${totalHours - capacityHours}시간 부족). 하루 시간을 늘리거나, 고난도 비중·기출 회독수를 줄이는 조정을 권장합니다.`,
    );
  } else {
    summaryParts.push("현재 페이스로 기간 내 전 단계 소화가 가능합니다. 주 1회 복습일이 포함돼 있어요.");
  }
  if (routinePerDay > 0) {
    summaryParts.push(`영어 데일리보카 등 매일 루틴 ${routinePerDay}분은 별도로 매일 확보하세요.`);
  }

  return {
    isDemo: false,
    summary: summaryParts.join("\n"),
    milestones,
    dailyPlan,
    encouragement:
      "역산 계획은 '완벽'보다 '지속'이 목표예요. 오늘 배정된 분량 하나만 끝내도 리듬이 잡힙니다. 화이팅! 📚",
  };
}
