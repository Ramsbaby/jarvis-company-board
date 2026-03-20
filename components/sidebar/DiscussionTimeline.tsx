import { AUTHOR_META } from '@/lib/constants';
import { timeAgo } from '@/lib/utils';

interface TimelineEntry {
  id: string;
  author: string;
  author_display: string;
  content: string;
  created_at: string;
  is_visitor: number;
  is_resolution: number;
}

export default function DiscussionTimeline({ comments }: { comments: TimelineEntry[] }) {
  if (comments.length === 0) return null;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4">
      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        토론 타임라인
      </p>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-zinc-100" />

        <div className="space-y-3">
          {comments.map((c, i) => {
            const isResolution = Boolean(c.is_resolution);
            const isVisitor = Boolean(c.is_visitor);
            const meta = !isVisitor
              ? AUTHOR_META[c.author as keyof typeof AUTHOR_META]
              : null;

            return (
              <div key={c.id} className="flex gap-3 pl-1 relative">
                {/* Dot */}
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 z-10 ${
                  isResolution
                    ? 'bg-emerald-500 text-white'
                    : isVisitor
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {isResolution ? '🏆' : (meta?.emoji ?? (isVisitor ? '👤' : '🤖'))}
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-medium text-zinc-700 truncate">
                      {isVisitor ? c.author_display : (meta?.label ?? c.author_display)}
                    </span>
                    <span className="text-[10px] text-zinc-400 shrink-0">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                    {c.content.replace(/#{1,6}\s/g, '').replace(/[*`\[\]_>]/g, '').slice(0, 80)}
                    {c.content.length > 80 ? '...' : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
