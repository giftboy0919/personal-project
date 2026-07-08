// 시험 커리큘럼 템플릿 레지스트리 — 프로젝트db(공무원 9급 직렬별 템플릿)를 앱에 번들로 포함.
// Vercel 배포 후에도 서버/외부 파일 없이 동작하도록 정적 import 한다.
import type { ExamTemplate } from "./examScheduler";

import indexJson from "@/data/exam/index_job_templates.json";
import admin_admlaw from "@/data/exam/template_admin_admlaw.json";
import admin_padmin from "@/data/exam/template_admin_padmin.json";
import common_english from "@/data/exam/template_common_english.json";
import common_korean from "@/data/exam/template_common_korean.json";
import correction_penology from "@/data/exam/template_correction_penology.json";
import criminal_law from "@/data/exam/template_criminal_law.json";
import criminal_procedure from "@/data/exam/template_criminal_procedure.json";
import customs_accounting from "@/data/exam/template_customs_accounting.json";
import customs_law from "@/data/exam/template_customs_law.json";
import labor_law from "@/data/exam/template_labor_law.json";
import postal_gyeri from "@/data/exam/template_postal_gyeri.json";
import social_welfare from "@/data/exam/template_social_welfare.json";
import statistics from "@/data/exam/template_statistics.json";
import statistics_economics from "@/data/exam/template_statistics_economics.json";
import tax_accounting from "@/data/exam/template_tax_accounting.json";
import tax_taxlaw from "@/data/exam/template_tax_taxlaw.json";

// 파일명 → 템플릿 데이터 (JSON마다 세부 스키마가 조금씩 달라 unknown 경유로 캐스팅)
const RAW: Record<string, unknown> = {
  "template_admin_admlaw.json": admin_admlaw,
  "template_admin_padmin.json": admin_padmin,
  "template_common_english.json": common_english,
  "template_common_korean.json": common_korean,
  "template_correction_penology.json": correction_penology,
  "template_criminal_law.json": criminal_law,
  "template_criminal_procedure.json": criminal_procedure,
  "template_customs_accounting.json": customs_accounting,
  "template_customs_law.json": customs_law,
  "template_labor_law.json": labor_law,
  "template_postal_gyeri.json": postal_gyeri,
  "template_social_welfare.json": social_welfare,
  "template_statistics.json": statistics,
  "template_statistics_economics.json": statistics_economics,
  "template_tax_accounting.json": tax_accounting,
  "template_tax_taxlaw.json": tax_taxlaw,
};
export const TEMPLATE_REGISTRY = RAW as Record<string, ExamTemplate>;

/** 스케줄러가 계산할 수 있는 표준 스키마인지 확인 (계리직 등 이형 스키마는 제외) */
function isUsableTemplate(t: ExamTemplate | undefined): boolean {
  const tiers = t?.difficulty_tiers?.tiers;
  const table = t?.master_question_bank?.table;
  return (
    Array.isArray(tiers) &&
    tiers.length > 0 &&
    tiers.every((x) => x && x.time_per_question_sec && Object.keys(x.time_per_question_sec).length > 0) &&
    Array.isArray(table) &&
    table.length > 0
  );
}

interface JobSeriesEntry {
  전공: string | string[];
  templates: string[];
  note?: string;
}
interface ExamIndex {
  common_subjects: Record<string, string>;
  job_series_map: Record<string, JobSeriesEntry>;
}
export const EXAM_INDEX = indexJson as unknown as ExamIndex;

const COMMON_FILES = ["template_common_korean.json", "template_common_english.json"];

export interface SelectableSeries {
  key: string; // job_series_map 키(직렬명)
  majors: string[]; // 전공 과목명
  templateFiles: string[]; // 전공 + 공통(별도구조 제외)
  usesCommon: boolean;
}

/** 필요한 전공 템플릿이 모두 번들에 존재하는 직렬만 선택지로 노출 */
export function getSelectableSeries(): SelectableSeries[] {
  const out: SelectableSeries[] = [];
  for (const [key, entry] of Object.entries(EXAM_INDEX.job_series_map)) {
    const majorFiles = entry.templates ?? [];
    if (majorFiles.length === 0) continue;
    // 전산직(미작성) · 계리직(이형 스키마) 등은 표준 계산 불가 → 제외
    const allUsable = majorFiles.every((f) => isUsableTemplate(TEMPLATE_REGISTRY[f]));
    if (!allUsable) continue;

    // 우정(계리) 등 '별도 시험구조'는 공통(국어·영어) 미적용
    const usesCommon = entry.전공 !== "별도 시험구조";
    const templateFiles = usesCommon ? [...majorFiles, ...COMMON_FILES] : [...majorFiles];
    const majors = Array.isArray(entry.전공) ? entry.전공 : [String(entry.전공)];
    out.push({ key, majors, templateFiles, usesCommon });
  }
  return out;
}

/** 직렬 선택 → 실제 템플릿 객체 배열 */
export function templatesForSeries(s: SelectableSeries): ExamTemplate[] {
  return s.templateFiles.map((f) => TEMPLATE_REGISTRY[f]).filter(Boolean);
}
