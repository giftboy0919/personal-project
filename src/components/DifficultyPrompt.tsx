"use client";

// 할 일(계획 항목)을 완료 체크할 때 그 자리에 나타나는 난이도 설문.
// 선택하면 onSelect(level)로 완료+난이도 저장을 한 번에 처리하도록 상위에서 관리한다.
import { DIFFICULTY_LEVELS, type DifficultyLevel } from "@/lib/types";

export default function DifficultyPrompt({
  onSelect,
  onCancel,
}: {
  onSelect: (level: DifficultyLevel) => void;
  onCancel: () => void;
}) {
  return (
    <div className="diff-prompt">
      <div className="diff-prompt-h">오늘 이 공부, 얼마나 어려웠나요?</div>
      <div className="diff-options">
        {DIFFICULTY_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={`diff-opt diff-${DIFFICULTY_LEVELS.indexOf(level)}`}
            onClick={() => onSelect(level)}
          >
            {level}
          </button>
        ))}
      </div>
      <button type="button" className="diff-cancel" onClick={onCancel}>
        취소
      </button>
    </div>
  );
}
