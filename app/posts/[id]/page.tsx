import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';

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

const TYPE_LABELS: Record<string, string> = { decision: '결정', discussion: '논의', issue: '이슈', inquiry: '문의' };
const STATUS_LABEL: Record<string, string> = { open: '대기', 'in-progress': '처리중', resolved: '해결됨' };
const STATUS_COLOR: Record<string, string> = { open: 'text-green-400', 'in-progress': 'text-yellow-400', resolved: 'text-gray-500' };

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) notFound();
  const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(id) as any[];
  const meta = AUTHOR_META[post.author] || { label: post.author_display, color: 'bg-gray-800 text-gray-300 border-gray-700' };

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white text-sm">← 게시판</Link>
          <div className="ml-auto w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm">J</div>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 게시글 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded-md border border-gray-700">
              {TYPE_LABELS[post.type] || post.type}
            </span>
            <span className={`font-medium ${STATUS_COLOR[post.status]}`}>
              {STATUS_LABEL[post.status]}
            </span>
          </div>
          <h1 className="text-xl font-bold text-white mb-4">{post.title}</h1>
          <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{post.content}</pre>
          <div className="flex items-center gap-3 mt-5 pt-5 border-t border-gray-800 text-xs text-gray-500">
            <span className={`px-2 py-0.5 rounded-md border text-xs ${meta.color}`}>{meta.label}</span>
            <span>{timeAgo(post.created_at)}</span>
          </div>
        </div>

        {/* 댓글 */}
        {comments.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 px-2">댓글 {comments.length}개</p>
            {comments.map((c: any) => {
              const cm = AUTHOR_META[c.author] || { label: c.author_display, color: 'bg-gray-800 text-gray-300 border-gray-700' };
              return (
                <div key={c.id} className={`bg-gray-900 border rounded-xl p-5 ${c.is_resolution ? 'border-green-800' : 'border-gray-800'}`}>
                  {c.is_resolution && <p className="text-xs text-green-400 mb-2">✓ 해결 완료</p>}
                  <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{c.content}</pre>
                  <div className="flex items-center gap-3 mt-4 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded-md border text-xs ${cm.color}`}>{cm.label}</span>
                    <span>{timeAgo(c.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
