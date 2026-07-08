// POST /api/exam-notes
// 규칙 기반 시험 계획(과목·단계 구조)을 받아 Claude로 '과목별/단계별 공부법 코멘트'를 생성.
// ▸ ANTHROPIC_API_KEY 없거나 실패 시 204(No Content) → 프론트는 조용히 코멘트 없이 진행.
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ExamNotes } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  jobSeries: string;
  tierLabel: string;
  deadline: string;
  hoursPerDay: number;
  feasible: boolean;
  subjects: { name: string; stages: { step: string; name: string }[] }[];
}

const SYSTEM = `당신은 대한민국 9급 공무원 수험 전략 코치입니다.
주어진 직렬·과목·단계(STEP) 구조와 목표 등급을 근거로, 실전적인 공부법 코멘트를 한국어로 작성하세요.
규칙:
1. 제공된 과목/단계 안에서만 조언하고, 근거 없는 특정 강사·교재·통계 수치는 지어내지 마세요.
2. 각 조언은 1~2문장으로 구체적이고 행동 가능하게 쓰세요.
3. 목표 등급(상/중/하위권)에 맞춰 물량·난이도 우선순위를 다르게 제시하세요.
4. 반드시 지정된 JSON 스키마로만 응답하세요.`;

const SCHEMA = {
  type: "object",
  properties: {
    overallStrategy: { type: "string", description: "전체 학습 전략 2~3문장" },
    subjectTips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subject: { type: "string" },
          tip: { type: "string" },
        },
        required: ["subject", "tip"],
        additionalProperties: false,
      },
    },
    stageTips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          step: { type: "string", description: "STEP0~STEP4" },
          tip: { type: "string" },
        },
        required: ["step", "tip"],
        additionalProperties: false,
      },
    },
  },
  required: ["overallStrategy", "subjectTips", "stageTips"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse(null, { status: 204 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
    if (!body?.jobSeries || !Array.isArray(body.subjects)) throw new Error("bad body");
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const subjectsText = body.subjects
    .map(
      (s) =>
        `- ${s.name}: ${s.stages.map((st) => `${st.step}(${st.name})`).join(" → ")}`,
    )
    .join("\n");

  const userPrompt = `직렬: ${body.jobSeries}
목표 등급: ${body.tierLabel}
시험(목표)일: ${body.deadline} / 하루 공부시간: ${body.hoursPerDay}시간
기간 내 물량 소화 가능 여부: ${body.feasible ? "가능" : "빠듯함(물량 초과 우려)"}

[과목 및 단계 구조]
${subjectsText}

위 구조를 근거로 overallStrategy(전체 전략), subjectTips(각 과목별 공부법), stageTips(STEP0~STEP4 각 단계별 공통 팁)를 JSON으로 작성하세요.`;

  try {
    const client = new Anthropic({ apiKey });
    const params = {
      model: "claude-opus-4-8",
      max_tokens: 3000,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    };
    const response = (await client.messages.create(
      params as never,
    )) as Anthropic.Messages.Message;
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("빈 응답");
    const notes = JSON.parse(textBlock.text) as ExamNotes;
    return NextResponse.json(notes);
  } catch (err) {
    console.error("[/api/exam-notes] 실패:", err);
    // 코멘트는 부가기능 → 실패해도 204로 조용히 스킵
    return new NextResponse(null, { status: 204 });
  }
}
