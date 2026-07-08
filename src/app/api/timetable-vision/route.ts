// POST /api/timetable-vision
// 시간표 스크린샷(이미지) + 배치할 학습 항목을 받아, Claude 비전이
// 해당 요일의 '바쁜 시간'을 읽고 → 빈 시간대에 학습 항목을 배치해 돌려준다.
// ▸ ANTHROPIC_API_KEY 가 없으면 비전 분석이 불가하므로 503 로 안내(폴백 없음).
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface Body {
  imageBase64: string; // data: 프리픽스 제거된 순수 base64
  mediaType: string; // "image/png" | "image/jpeg" | ...
  weekday: string; // "월".."일"
  dateLabel: string; // "2026-07-09 (목)"
  dayStart: string; // "09:00"
  dayEnd: string; // "23:00"
  items: { title: string; minutes: number }[];
}

const SYSTEM = `당신은 시간표 스크린샷을 읽고 '빈 시간'에 공부 항목을 배치하는 스케줄러입니다.
규칙:
1. 이미지에서 주어진 요일에 해당하는 열(칸)의 '이미 채워진(바쁜) 시간 블록'을 시:분(HH:MM)으로 최대한 정확히 읽으세요.
2. 지정된 하루 활동 범위(dayStart~dayEnd) 안에서, 바쁜 블록을 제외한 '빈 구간'을 계산하세요.
3. 주어진 학습 항목들을 빈 구간에 순서대로 배치하세요. 각 항목은 요청된 소요시간(minutes)만큼 차지하며, 서로 겹치거나 바쁜 블록과 겹치지 않게 하세요. 항목 사이에는 5~10분 여유를 두어도 좋습니다.
4. 빈 시간이 부족하면 배치 가능한 만큼만 넣고, 남은 항목은 note에 적으세요.
5. 이미지가 시간표로 보이지 않거나 판독 불가하면 readable=false로 하고 배치는 비우세요.
6. 모든 시간은 24시간제 "HH:MM". 반드시 지정된 JSON 스키마로만 응답하세요.`;

const SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean", description: "시간표를 읽을 수 있었는지" },
    detectedBusy: {
      type: "array",
      description: "해당 요일의 바쁜 시간 블록",
      items: {
        type: "object",
        properties: {
          start: { type: "string" },
          end: { type: "string" },
          label: { type: "string" },
        },
        required: ["start", "end", "label"],
        additionalProperties: false,
      },
    },
    placements: {
      type: "array",
      description: "빈 시간에 배치한 학습 항목",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          start_time: { type: "string" },
          end_time: { type: "string" },
        },
        required: ["title", "start_time", "end_time"],
        additionalProperties: false,
      },
    },
    note: { type: "string" },
  },
  required: ["readable", "detectedBusy", "placements", "note"],
  additionalProperties: false,
} as const;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "시간표 분석에는 서버에 ANTHROPIC_API_KEY 설정이 필요합니다." },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
    if (!body?.imageBase64 || !body?.mediaType) throw new Error("no image");
  } catch {
    return NextResponse.json({ error: "이미지를 다시 업로드해주세요." }, { status: 400 });
  }

  const itemsText =
    body.items.length > 0
      ? body.items.map((it) => `- ${it.title} (${it.minutes}분)`).join("\n")
      : "(배치할 학습 항목이 없습니다 — 빈 시간만 알려주세요)";

  const userText = `대상 요일: ${body.weekday}요일 (${body.dateLabel})
하루 활동 범위: ${body.dayStart} ~ ${body.dayEnd}

[빈 시간에 배치할 학습 항목]
${itemsText}

첨부한 시간표 스크린샷에서 ${body.weekday}요일의 바쁜 시간을 읽고, 위 학습 항목을 빈 시간에 배치해 JSON으로 답하세요.`;

  try {
    const client = new Anthropic({ apiKey });
    const params = {
      model: "claude-opus-4-8",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: body.mediaType,
                data: body.imageBase64,
              },
            },
            { type: "text", text: userText },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    };
    const response = (await client.messages.create(
      params as never,
    )) as Anthropic.Messages.Message;
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("빈 응답");
    return NextResponse.json(JSON.parse(textBlock.text));
  } catch (err) {
    console.error("[/api/timetable-vision] 실패:", err);
    return NextResponse.json(
      { error: "시간표 분석에 실패했습니다. 이미지를 더 선명하게 올리거나 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }
}
