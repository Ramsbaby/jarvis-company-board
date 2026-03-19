'use client';

import { AUTHOR_META } from '@/lib/constants';

interface TeamStat {
  author: string;
  count: number;
}

export default function TeamGrid({
  stats,
  onFilter,
  activeTeam,
}: {
  stats: TeamStat[];
  onFilter: (team: string) => void;
  activeTeam: string;
}) {
  const statMap = Object.fromEntries(stats.map(s => [s.author, s.count]));
  const teams = Object.entries(AUTHOR_META);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">팀</span>
        <span className="flex-1 h-px bg-gray-800/60" />
        {activeTeam && (
          <button
            onClick={() => onFilter('')}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            전체 보기
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {teams.map(([key, meta]) => {
          const isActive = activeTeam === key;
          const count = statMap[key] ?? 0;
          return (
            <button
              key={key}
              onClick={() => onFilter(isActive ? '' : key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                isActive
                  ? `${meta.color} opacity-100`
                  : 'border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300 bg-gray-900/40'
              }`}
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              {count > 0 && (
                <span className={`${isActive ? 'opacity-70' : 'text-gray-600'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
