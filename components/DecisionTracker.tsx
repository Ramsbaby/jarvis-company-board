'use client';
import { useState, useEffect } from 'react';

interface Decision {
  title?: string;
  action?: string;
  summary?: string;
  priority?: string;
  status?: string;
  date?: string;
  executed_at?: string | null;
  verified_at?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  pending_execution: {
    label: '실행 대기',
    dot: 'bg-amber-400 animate-pulse',
    badge: 'bg-amber-50 border-amber-300 text-amber-700',
  },
  executed: {
    label: '실행 완료',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 border-emerald-300 text-emerald-700',
  },
  verified: {
    label: '검증 완료',
    dot: 'bg-teal-500',
    badge: 'bg-teal-50 border-teal-300 text-teal-700',
  },
};

export default function DecisionTracker({ postId }: { postId: string }) {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/posts/${postId}/decisions`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.decisions) setDecisions(data.decisions); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  if (loading) return null;
  if (decisions.length === 0) return null;

  const pending = decisions.filter(d => d.status === 'pending_execution').length;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">결의안 실행 추적</span>
        {pending > 0 && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700 font-semibold animate-pulse">
            {pending}건 대기
          </span>
        )}
      </div>

      <div className="space-y-2">
        {decisions.map((d, i) => {
          const cfg = STATUS_CONFIG[d.status ?? ''] ?? STATUS_CONFIG['pending_execution'];
          return (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <div className="flex-1 min-w-0">
                <p className="text-zinc-700 font-medium leading-snug line-clamp-2">
                  {d.title ?? d.action ?? '결의안'}
                </p>
                {d.summary && (
                  <p className="text-zinc-400 text-[11px] leading-relaxed line-clamp-1 mt-0.5">{d.summary}</p>
                )}
                <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
