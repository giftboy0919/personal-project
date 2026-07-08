// POST /api/plan
// 사용자의 목표 입력을 받아 Claude로 '일간 단위 계획'을 생성해서 돌려주는 서버 라우트.
// ▸ ANTHROPIC_API_KEY 는 이 서버 코드에서만 읽으며, 브라우저로 절대 나가지 않는다.
// ▸ 키가 없으면 데모 계획으로 폴백해서 프론트가 항상 동작하게 한다.
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  SYSTEM_PROMPT,
  PLAN_JSON_SCHEMA,
  buildUserPrompt,
  buildDemoPlan,
} from "@/lib/planPrompt";
import type { PlanRequestBody, PlanResult } from "@/lib/types";

// Node 런타임(Anthropic SDK 사용). Edge 런타임에서는 SDK가 제대로 안 도는 경우가 있어 명시.
export const runtime = "nodejs";

function validate(body: unknown): PlanRequestBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.goal !== "string" || b.goal.trim() === "") return null;
  if (typeof b.deadline !== "string" || b.deadline.trim() === "") return null;
  const hours = Number(b.hoursPerDay);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return {
    goal: b.goal.trim(),
    deadline: b.deadline.trim(),
    currentLevel: typeof b.currentLevel === "string" ? b.currentLevel.trim() : "",
    hoursPerDay: hours,
  };
}

export async function POST(req: Request) {
  let parsed: PlanRequestBody | null;
  try {
    parsed = validate(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return NextResponse.json(
      { error: "목표와 기한, 하루 가능 시간을 올바르게 입력해주세요." },
      { status: 400 },
    );
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // 키가 없으면 데모 계획으로 폴백 (개발/미리보기용)
  if (!apiKey) {
    return NextResponse.json(buildDemoPlan(parsed, todayISO));
  }

  try {
    const client = new Anthropic({ apiKey });

    // 구조화 출력(output_config)은 최신 SDK 타입에만 존재하므로,
    // 버전에 관계없이 빌드가 깨지지 않도록 params 를 넓은 타입으로 캐스팅한다.
    const params = {
      model: "claude-opus-4-8",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(parsed, todayISO) }],
      // 응답을 우리 JSON 스키마에 맞춰 강제한다.
      output_config: {
        format: { type: "json_schema", schema: PLAN_JSON_SCHEMA },
      },
    };
    const response = (await client.messages.create(
      params as never,
    )) as Anthropic.Messages.Message;

    // 스키마 강제 시 첫 text 블록이 유효한 JSON.
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AI 응답에서 계획 텍스트를 찾지 못했습니다.");
    }
    const result = JSON.parse(textBlock.text) as PlanResult;
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/plan] AI 호출 실패:", err);
    // 실패 시에도 사용자 흐름이 끊기지 않도록 데모로 폴백하되, 알림 플래그를 남긴다.
    const fallback = buildDemoPlan(parsed, todayISO);
    fallback.summary =
      "⚠️ AI 호출에 실패해 임시 예시 계획을 표시합니다. 잠시 후 다시 시도해주세요.\n\n" +
      fallback.summary;
    return NextResponse.json(fallback, { status: 200 });
  }
}
