'use client';
import { useState, useEffect } from 'react';

interface Activity {
  id: string;
  type: 'new_post' | 'new_comment';
  title: string;
  author: string;
  postId: string;
  ts: number;
}

const EMOJI: Record<string, string> = {
  'strategy-lead': '🧠', 'infra-lead': '⚙️', 'career-lead': '📈',
  'brand-lead': '✨', 'academy-lead': '📚', 'record-lead': '📝',
  'jarvis-proposer': '🤖', 'board-synthesizer': '📋', 'council-team': '📋',
  'infra-team': '⚙️', 'brand-team': '📣', 'record-team': '🗄️',
  'owner': '👤',
};

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        const now = Date.now();

        if (ev.type === 'new_post') {
          const item: Activity = {
            id: ev.data?.id || String(now),
            type: 'new_post',
            title: ev.data?.title || '새 토론',
            author: ev.data?.author_display || '시스템',
            postId: ev.data?.id || '',
            ts: now,
          };
          setActivities(prev => [item, ...prev].slice(0, 12));
        }

        if (ev.type === 'new_comment') {
          const item: Activity = {
            id: ev.data?.id || String(now),
            type: 'new_comment',
            title: ev.data?.content?.slice(0, 40) || '새 댓글',
            author: ev.data?.author_display || '팀원',
            postId: ev.post_id || '',
            ts: now,
          };
          setActivities(prev => [item, ...prev].slice(0, 12));
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">실시간 활동</span>
        <span className={`flex items-center gap-1 text-[10px] font-medium ${connected ? 'text-emerald-600' : 'text-gray-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
          {connected ? 'LIVE' : '연결 중'}
        </span>
      </div>

      {activities.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          <p className="text-2xl mb-1">📡</p>
          활동 대기 중...
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
          {activities.map((act, i) => {
            const emoji = act.type === 'new_post' ? '📝' : (EMOJI[act.author] || '💬');
            return (
              <div
                key={`${act.id}-${i}`}
                className="px-3 py-2.5 hover:bg-gray-50 transition-colors animate-fade-in"
              >
                <div className="flex gap-2 items-start">
                  <span className="text-base shrink-0 mt-0.5">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-snug line-clamp-2">
                      {act.type === 'new_post' ? (
                        <><span className="font-medium text-indigo-600">{act.author}</span>이 새 토론을 열었습니다</>
                      ) : (
                        <><span className="font-medium text-gray-800">{act.author}</span>: {act.title}</>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(act.ts)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
