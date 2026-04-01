export const dynamic = 'force-dynamic';
import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import ReportClient from '@/app/interview/[sessionId]/report/ReportClient';

interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  score: number | null;
  strengths: string | null;
  weaknesses: string | null;
  better_answer: string | null;
  missing_keywords: string | null;
  created_at: string;
}

interface Session {
  id: string;
  company: string;
  category: string;
  difficulty: string;
  status: string;
  total_score: number | null;
  created_at: string;
  share_token: string | null;
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const session = db.prepare('SELECT * FROM interview_sessions WHERE share_token = ?').get(token) as Session | undefined;
  if (!session) notFound();

  const messages = db.prepare(
    'SELECT * FROM interview_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(session.id) as Message[];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
          <p className="text-blue-700 font-medium">🔗 공유된 면접 결과</p>
          <p className="text-blue-500 text-sm mt-1">이 리포트는 공개 공유 링크로 열람 중입니다</p>
        </div>
        <ReportClient session={session} messages={messages} readOnly />
      </div>
    </div>
  );
}
