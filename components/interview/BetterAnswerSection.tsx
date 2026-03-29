'use client';
import { useState } from 'react';

/** better_answer 텍스트를 번호형 팁 배열로 분해 */
export function parseTips(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
  return sentences.length >= 2 ? sentences : [text];
}

/** 점수 구간별 모범 답안 표시 — 항상 접힘, 클릭 시 번호형 팁 펼침 */
export function BetterAnswerSection({
  betterAnswer,
  score,
  missingKeywords = [],
}: {
  betterAnswer: string;
  score: number;
  missingKeywords?: string[];
}) {
  const [open, setOpen] = useState(false);
  const tips = parseTips(betterAnswer);

  const config = score < 60
    ? {
        label: '📖 모범 답안',
        sublabel: '이렇게 답했어야 합니다',
        btnText: open ? '접기 ▲' : `모범 답안 보기 (${tips.length}가지 팁) ▼`,
        containerCls: 'bg-red-50 border border-red-200 rounded-xl p-3',
        headerCls: 'text-red-700',
        tipNumCls: 'bg-red-500 text-white',
      }
    : score < 80
    ? {
        label: '💡 모범 답안',
        sublabel: '펼쳐서 확인하세요',
        btnText: open ? '접기 ▲' : `모범 답안 보기 (${tips.length}가지 팁) ▼`,
        containerCls: 'bg-amber-50 border border-amber-200 rounded-xl p-3',
        headerCls: 'text-amber-700',
        tipNumCls: 'bg-amber-500 text-white',
      }
    : {
        label: '✨ 더 발전시키려면',
        sublabel: '추가 심화 포인트',
        btnText: open ? '접기 ▲' : '심화 팁 보기 ▼',
        containerCls: 'bg-indigo-50 border border-indigo-100 rounded-xl p-3',
        headerCls: 'text-indigo-700',
        tipNumCls: 'bg-indigo-500 text-white',
      };

  return (
    <div className={config.containerCls}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className={`text-[11px] font-bold ${config.headerCls}`}>{config.label}</span>
          {!open && <span className="text-[10px] text-zinc-400 ml-2">{config.sublabel}</span>}
        </div>
        <button
          onClick={() => setOpen(v => !v)}
          className={`text-[11px] font-semibold ${config.headerCls} hover:opacity-70 transition-opacity`}
        >
          {config.btnText}
        </button>
      </div>
      {open && (
        <ol className="space-y-2 mt-2">
          {tips.map((tip, i) => {
            const highlighted = missingKeywords.some(kw => tip.includes(kw));
            return (
              <li key={i} className={`flex gap-2 items-start text-xs text-zinc-800 leading-relaxed ${highlighted ? 'font-medium' : ''}`}>
                <span className={`shrink-0 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center mt-0.5 ${config.tipNumCls}`}>
                  {i + 1}
                </span>
                <span>{tip}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
