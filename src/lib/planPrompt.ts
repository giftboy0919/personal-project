// AI 프롬프트 구성 + 출력 스키마 + 데모(폴백) 계획.
// 서버(API 라우트)에서만 import 된다. 여기엔 비밀키가 들어가지 않는다.
import type { PlanRequestBody, PlanResult } from "./types";

/**
 * 시스템 프롬프트 — 가드레일을 명시한다.
 * 핵심: "큰 목표를 일간 단위로 역산해서 배분" (통합 라이프 대시보드의 AI 전략).
 */
export const SYSTEM_PROMPT = `당신은 사용자의 큰 목표를 '실행 가능한 일간 단위 계획'으로 역산해 짜주는 학습·목표 관리 코치입니다.
다음 규칙을 반드시 지키세요.

1. 사용자가 입력한 목표, 기한, 현재 수준, 하루 가능 시간만을 근거로 계획을 세우세요.
2. 오늘 날짜부터 목표 기한까지 남은 기간을 스스로 계산하고, 그 안에서 무리 없이 소화 가능한 분량으로 배분하세요.
   - 하루 계획의 estimatedMinutes 합이 사용자의 '하루 가능 시간'을 크게 넘지 않게 하세요.
3. 큰 목표 → 2~5개의 중간 목표(마일스톤) → 일자별 실행 항목 순으로 쪼개세요.
4. dailyPlan 은 오늘부터 순서대로, 최대 30개 항목까지만 만드세요.
   기간이 30일보다 길면 앞쪽 중요한 날들 위주로 대표 일정을 넣고, 나머지는 마일스톤으로 요약하세요.
5. 각 항목은 구체적이고 검증 가능한 행동으로 쓰세요. ("공부하기"(X) → "3장 예제 5문제 풀고 오답 정리"(O))
6. 단정적 보장("무조건 합격한다")은 하지 말고, 현실적이고 격려하는 어조를 쓰세요.
7. 모든 텍스트는 한국어로 작성하세요.
8. 반드시 지정된 JSON 스키마 형식으로만 응답하세요.`;

/** 구조화 출력(structured outputs)용 JSON 스키마 */
export const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "전체 전략을 1~2문장으로 요약",
    },
    milestones: {
      type: "array",
      description: "2~5개의 중간 목표",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          targetDate: { type: "string", description: "YYYY-MM-DD" },
          description: { type: "string" },
        },
        required: ["title", "targetDate", "description"],
        additionalProperties: false,
      },
    },
    dailyPlan: {
      type: "array",
      description: "오늘부터 순서대로, 최대 30개",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          title: { type: "string" },
          detail: { type: "string" },
          estimatedMinutes: { type: "integer" },
        },
        required: ["date", "title", "detail", "estimatedMinutes"],
        additionalProperties: false,
      },
    },
    encouragement: { type: "string", description: "응원 한마디" },
  },
  required: ["summary", "milestones", "dailyPlan", "encouragement"],
  additionalProperties: false,
} as const;

/** 사용자 입력을 담은 user 프롬프트 문자열 */
export function buildUserPrompt(body: PlanRequestBody, todayISO: string): string {
  return `오늘 날짜: ${todayISO}

[사용자 입력]
- 목표: ${body.goal}
- 목표 기한: ${body.deadline}
- 현재 수준/상황: ${body.currentLevel || "(입력 없음)"}
- 하루 투자 가능 시간: ${body.hoursPerDay}시간

위 정보를 바탕으로, 오늘(${todayISO})부터 목표 기한(${body.deadline})까지의 계획을 시스템 규칙과 JSON 스키마에 맞춰 작성하세요.`;
}

/**
 * ANTHROPIC_API_KEY 가 없을 때 반환하는 데모 계획.
 * 키를 넣기 전에도 프론트 화면과 흐름을 그대로 확인할 수 있게 한다.
 */
export function buildDemoPlan(body: PlanRequestBody, todayISO: string): PlanResult {
  const today = new Date(todayISO);
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const perDay = Math.max(30, Math.round((body.hoursPerDay || 1) * 60 * 0.8));

  return {
    isDemo: true,
    summary: `(데모) "${body.goal}" 목표를 오늘부터 ${body.deadline}까지 3단계로 나눠 하루 약 ${body.hoursPerDay}시간씩 배분한 예시 계획입니다. ANTHROPIC_API_KEY를 설정하면 실제 AI가 맞춤 계획을 생성합니다.`,
    milestones: [
      {
        title: "1단계 · 기초 다지기",
        targetDate: addDays(7),
        description: "전체 범위를 훑고 핵심 개념과 용어를 파악하는 기간.",
      },
      {
        title: "2단계 · 집중 학습",
        targetDate: addDays(21),
        description: "약한 부분을 반복하고 문제 풀이로 실전 감각을 올리는 기간.",
      },
      {
        title: "3단계 · 마무리 점검",
        targetDate: body.deadline,
        description: "총정리, 오답 노트 복습, 실전 모의 점검.",
      },
    ],
    dailyPlan: [
      {
        date: addDays(0),
        title: "전체 범위 파악 & 계획 확정",
        detail: "목표 범위를 훑어보고, 이 계획을 내 상황에 맞게 조정합니다.",
        estimatedMinutes: perDay,
      },
      {
        date: addDays(1),
        title: "핵심 개념 1회독 시작",
        detail: "가장 기초가 되는 단원부터 개념을 정리합니다.",
        estimatedMinutes: perDay,
      },
      {
        date: addDays(2),
        title: "개념 정리 + 예제 풀이",
        detail: "어제 배운 부분의 예제를 직접 풀고 오답을 표시합니다.",
        estimatedMinutes: perDay,
      },
    ],
    encouragement:
      "작게 시작하는 게 가장 강력합니다. 오늘 첫 항목 하나만 끝내도 절반은 성공이에요! 🌱",
  };
}
