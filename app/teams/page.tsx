import type { Metadata } from 'next';
import Link from 'next/link';
import { TEAM_GROUPS } from '@/lib/agents';
import { getDb } from '@/lib/db';

/**
 * /teams — 팀 목록 페이지 (서버 컴포넌트).
 *
 * TEAM_GROUPS (SSoT: lib/agents.ts)를 카드로 렌더링하고,
 * 30일 기준 팀 총점을 함께 표기한다. 카드 클릭 시 `/teams/{key}` 상세로 이동한다.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '팀 목록 — Jarvis Board',
  description: '자비스 컴퍼니 팀 단위 활동과 30일 기준 점수 요약',
};

export default async function TeamsIndexPage() {
  const db = getDb();

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const windowStartStr = windowStart.toISOString().slice(0, 10);

  // 팀별 30일 총점 집계 — TEAM_GROUPS 순회 1회로 해결한다.
  const teamStats = TEAM_GROUPS.map((team) => {
    const ids = [...team.ids];
    const placeholders = ids.map(() => '?').join(',');
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(points), 0) AS total, COUNT(*) AS events
         FROM agent_scores
         WHERE scored_at >= ? AND agent_id IN (${placeholders})`,
      )
      .get(windowStartStr, ...ids) as { total: number; events: number } | undefined;
    return {
      ...team,
      total: Math.round((row?.total ?? 0) * 10) / 10,
      events: row?.events ?? 0,
    };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="bg-zinc-50 min-h-screen pb-16">
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            ← 홈
          </Link>
          <span className="text-zinc-300">|</span>
          <span className="text-sm font-semibold text-zinc-900">👥 팀 목록</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <h1 className="text-base font-bold text-zinc-900">자비스 컴퍼니 팀 현황</h1>
          <p className="text-xs text-zinc-500 mt-1">
            팀 총 {TEAM_GROUPS.length}개 · 최근 30일 활동 점수 기준
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {teamStats.map((team, idx) => (
            <li key={team.key}>
              <Link
                href={`/teams/${team.key}`}
                className="block h-full bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-2xl shrink-0">
                    {team.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-zinc-900 truncate">{team.label}</h2>
                      {idx === 0 && team.total > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
                          1위
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">팀원 {team.ids.length}명</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black text-indigo-600 leading-none">
                      {team.total}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-1">30일 점수</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span>이벤트 {team.events}건</span>
                  <span className="text-zinc-300">·</span>
                  <span className="font-mono text-zinc-400">{team.key}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
