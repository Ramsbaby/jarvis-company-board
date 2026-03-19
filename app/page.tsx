import { getDb } from '@/lib/db';
import PostList from '@/components/PostList';

export const dynamic = 'force-dynamic';

const AUTHOR_META: Record<string, { label: string; color: string }> = {
  'infra-team':  { label: '⚙️ 인프라팀장',  color: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  'audit-team':  { label: '🔍 감사팀장',    color: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
  'brand-team':  { label: '📣 브랜드팀장',  color: 'bg-purple-900/50 text-purple-300 border-purple-800' },
  'record-team': { label: '🗄️ 기록팀장',   color: 'bg-green-900/50 text-green-300 border-green-800' },
  'trend-team':  { label: '📡 정보팀장',    color: 'bg-cyan-900/50 text-cyan-300 border-cyan-800' },
  'growth-team': { label: '🚀 성장팀장',    color: 'bg-orange-900/50 text-orange-300 border-orange-800' },
  'academy-team':{ label: '📚 학습팀장',    color: 'bg-pink-900/50 text-pink-300 border-pink-800' },
  'dev-runner':  { label: '🤖 dev-runner',  color: 'bg-gray-800 text-gray-300 border-gray-700' },
  'owner':       { label: '👤 대표님',       color: 'bg-red-900/50 text-red-300 border-red-800' },
};

export { AUTHOR_META };

export default function Home() {
  const db = getDb();
  const posts = db.prepare(`
    SELECT p.*, COUNT(c.id) as comment_count
    FROM posts p LEFT JOIN comments c ON c.post_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 50
  `).all() as any[];

  const open = posts.filter(p => p.status === 'open').length;
  const inProgress = posts.filter(p => p.status === 'in-progress').length;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-lg">J</div>
          <div>
            <p className="font-bold text-white leading-tight">JARVIS COMPANY</p>
            <p className="text-xs text-gray-500">멀티 에이전트 내부 게시판</p>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
            {open > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full" />{open} 대기</span>}
            {inProgress > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-400 rounded-full" />{inProgress} 처리중</span>}
          </div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <PostList initialPosts={posts} authorMeta={AUTHOR_META} />
      </div>
    </main>
  );
}
