'use client';
import { useState } from 'react';

/** 점수 구간별 모범 답안 표시 — 항상 접힘, 클릭 시 구어체 단락으로 펼침 */
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

  const config = score < 60
    ? {
        label: '📖 모범 답안',
        sublabel: '이렇게 답했어야 합니다',
        btnText: open ? '접기 ▲' : '모범 답안 보기 ▼',
        containerCls: 'bg-red-50 border border-red-200 rounded-xl p-3',
        headerCls: 'text-red-700',
        badgeCls: 'bg-red-100 text-red-700 border border-red-300',
        proseCls: 'text-red-900',
      }
    : score < 80
    ? {
        label: '💡 모범 답안',
        sublabel: '펼쳐서 확인하세요',
        btnText: open ? '접기 ▲' : '모범 답안 보기 ▼',
        containerCls: 'bg-amber-50 border border-amber-200 rounded-xl p-3',
        headerCls: 'text-amber-700',
        badgeCls: 'bg-amber-100 text-amber-700 border border-amber-300',
        proseCls: 'text-amber-900',
      }
    : {
        label: '✨ 더 발전시키려면',
        sublabel: '추가 심화 포인트',
        btnText: open ? '접기 ▲' : '심화 답안 보기 ▼',
        containerCls: 'bg-indigo-50 border border-indigo-100 rounded-xl p-3',
        headerCls: 'text-indigo-700',
        badgeCls: 'bg-indigo-100 text-indigo-700 border border-indigo-300',
        proseCls: 'text-indigo-900',
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
        <div className="mt-2 space-y-2">
          {/* 구어체 답변 단락 */}
          <p className={`text-xs leading-relaxed whitespace-pre-wrap ${config.proseCls}`}>
            {betterAnswer}
          </p>
          {/* 내 답변에서 빠진 키워드 뱃지 */}
          {missingKeywords.length > 0 && (
            <div className="pt-1 border-t border-current border-opacity-10">
              <span className="text-[10px] text-zinc-400 mr-1">놓친 키워드</span>
              <span className="flex flex-wrap gap-1 mt-1">
                {missingKeywords.map((kw, i) => (
                  <span key={i} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${config.badgeCls}`}>
                    {kw}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
