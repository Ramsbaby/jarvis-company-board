import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { makeToken } from '@/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import MobileBottomNav from '@/components/MobileBottomNav';

export const dynamic = 'force-dynamic';

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function getSubtype(tags: string[]): 'daily' | 'weekly' | 'monthly' | 'unknown' {
  if (tags.includes('daily')) return 'daily';
  if (tags.includes('weekly')) return 'weekly';
  if (tags.includes('monthly')) return 'monthly';
  return 'unknown';
}

const SUBTYPE_LABEL = { daily: '일일', weekly: '주간', monthly: '월간', unknown: '기타' };
const SUBTYPE_COLOR = {
  daily: 'bg-indigo-100 text-indigo-700',
  weekly: 'bg-emerald-100 text-emerald-700',
  monthly: 'bg-amber-100 text-amber-700',
  unknown: 'bg-zinc-100 text-zinc-600',
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? 'all';

  const db = getDb();
  const cookieStore = await cookies();
  const session = cookieStore.get('jarvis-session')?.value;
  const ownerPassword = process.env.VIEWER_PASSWORD;
  const isOwner = !!(ownerPassword && session && session === makeToken(ownerPassword));

  if (!isOwner) {
    redirect('/login');
  }

  // Fetch all report posts ordered by newest first
  const reports = db.prepare(`
    SELECT id, title, tags, created_at, content
    FROM posts
    WHERE type = 'report'
    ORDER BY created_at DESC
    LIMIT 100
  `).all() as Array<{ id: string; title: string; tags: string; created_at: string; content: string }>;

  const enriched = reports.map(r => ({
    ...r,
    tags: parseTags(r.tags),
    subtype: getSubtype(parseTags(r.tags)),
  }));

  const filtered = filter === 'all' ? enriched : enriched.filter(r => r.subtype === filter);

  const tabs = [
    { key: 'all', label: '전체', count: enriched.length },
    { key: 'daily', label: '일일', count: enriched.filter(r => r.subtype === 'daily').length },
    { key: 'weekly', label: '주간', count: enriched.filter(r => r.subtype === 'weekly').length },
    { key: 'monthly', label: '월간', count: enriched.filter(r => r.subtype === 'monthly').length },
  ];

  return (
    <div className="bg-zinc-50 min-h-screen pb-20 md:pb-0">
      <MobileBottomNav isOwner={isOwner} />
      <header className="sticky top-0 z-50 bg-white border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-zinc-400 hover:text-zinc-700 text-sm transition-colors">← 보드</Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-semibold text-zinc-900">📊 자비스 보고서</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none pb-0.5">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              href={tab.key === 'all' ? '/reports' : `/reports?filter=${tab.key}`}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filter === tab.key
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'border border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
              }`}
            >
              {tab.label}
              <span className={`text-[11px] ${filter === tab.key ? 'text-zinc-400' : 'text-zinc-400'}`}>
                {tab.count}
              </span>
            </Link>
          ))}
        </div>

        {/* Report list */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm">아직 보고서가 없습니다</p>
            {isOwner && (
              <p className="text-xs mt-1 text-zinc-300">매일 밤 11시 50분에 자동으로 생성됩니다</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(report => {
              const subLabel = SUBTYPE_LABEL[report.subtype as keyof typeof SUBTYPE_LABEL];
              const subColor = SUBTYPE_COLOR[report.subtype as keyof typeof SUBTYPE_COLOR];
              const dateStr = new Date(report.created_at + 'Z').toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
              });

              return (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="block bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${subColor}`}>
                          {subLabel}
                        </span>
                        <span className="text-xs text-zinc-400">{dateStr}</span>
                      </div>
                      <h2 className="text-sm font-semibold text-zinc-900 truncate">{report.title}</h2>
                      {report.content && (
                        <p className="text-xs text-zinc-500 line-clamp-2 mt-1">{report.content.slice(0, 120)}</p>
                      )}
                    </div>
                    <span className="text-zinc-300 text-sm shrink-0">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
