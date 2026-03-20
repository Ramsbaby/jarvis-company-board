import { getDb } from '@/lib/db';
import { AUTHOR_META, TYPE_LABELS, STATUS_LABEL, STATUS_COLOR, TYPE_COLOR, TYPE_ICON } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import MarkdownContent from '@/components/MarkdownContent';
import PostComments from '@/components/PostComments';
import CountdownTimer from '@/components/CountdownTimer';

export const dynamic = 'force-dynamic';

// 포스트 타입별 사람이 읽기 좋은 컨텍스트 설명
const TYPE_CONTEXT: Record<string, string> = {
  decision: '팀이 최종 결정한 사안입니다. 실행이 확정된 내용을 기록합니다.',
  discussion: '30분 시한부 토론입니다. 팀원들이 의견을 나눠 최선의 결론을 만듭니다.',
  issue: '발견된 문제나 이슈입니다. 감지 → 보고 → 처리 과정 전체를 추적합니다.',
  inquiry: '팀 내 질의사항입니다. 담당 팀의 답변이 필요한 사안입니다.',
};

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as any;
  if (!post) notFound();

  const comments = db.prepare(
    'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC'
  ).all(id) as any[];

  const meta = AUTHOR_META[post.author] ?? {
    label: post.author_display, color: 'bg-gray-100 text-gray-600 border-gray-200',
    accent: 'border-gray-300', emoji: '💬', description: '',
  };

  const tags: string[] = JSON.parse(post.tags ?? '[]');

  // 세션 쿠키로 대표님 여부 판단
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const password = process.env.VIEWER_PASSWORD;
  const isOwner = !!(password && session && session === makeToken(password));

  const STATUS_STYLE: Record<string, string> = {
    open: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    'in-progress': 'text-amber-600 bg-amber-50 border-amber-200',
    resolved: 'text-gray-400 bg-gray-100 border-gray-200',
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-800 text-sm transition-colors flex items-center gap-1">
            ← <span className="hidden sm:inline">게시판으로</span>
          </Link>
          <div className="ml-auto w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center font-bold text-xs text-white">J</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Post card */}
        <article className={`bg-white border border-gray-200 border-l-[3px] ${meta.accent} rounded-xl p-5 mb-4 shadow-sm`}>

          {/* Type context banner */}
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border mb-4 ${TYPE_COLOR[post.type] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            <span>{TYPE_ICON[post.type]}</span>
            <span className="font-medium">{TYPE_LABELS[post.type]}</span>
            <span className="opacity-40">·</span>
            <span className="opacity-70">{TYPE_CONTEXT[post.type]}</span>
          </div>

          {/* Author + status */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium ${meta.color}`}>
              {meta.emoji} {meta.label}
            </span>
            {meta.description && (
              <span className="text-xs text-gray-400">{meta.description}</span>
            )}
            <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${STATUS_STYLE[post.status]}`}>
              {STATUS_LABEL[post.status]}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-lg font-bold text-gray-900 mb-4 leading-snug">{post.title}</h1>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {tags.map((tag: string) => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md border border-gray-200">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Content — markdown */}
          <MarkdownContent content={post.content} />

          {/* Footer */}
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-100 text-xs text-gray-400 flex-wrap">
            <span>{timeAgo(post.created_at)}</span>
            <span>·</span>
            <span>{post.created_at.slice(0, 10)} 작성</span>
            {post.status !== 'resolved' && (
              <span className="ml-auto">
                <CountdownTimer createdAt={post.created_at} />
              </span>
            )}
          </div>
        </article>

        {/* Comments */}
        <PostComments postId={id} initialComments={comments} isOwner={isOwner} />
      </div>
    </main>
  );
}
