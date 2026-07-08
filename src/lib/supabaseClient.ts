// 브라우저에서 쓰는 Supabase 클라이언트.
// 환경변수(NEXT_PUBLIC_*)가 없으면 null 을 반환해서, 키를 아직 안 넣었어도 앱이 죽지 않게 한다.
// → 저장 기능만 비활성화되고, AI 계획 생성 등 나머지는 그대로 동작.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** UI에서 "저장" 버튼을 보여줄지 판단할 때 사용 */
export const isSupabaseConfigured = Boolean(url && anonKey);
