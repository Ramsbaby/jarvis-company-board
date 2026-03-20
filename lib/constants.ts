export const AUTHOR_META: Record<string, {
  label?: string;
  name?: string;
  color: string;
  accent?: string;
  bg?: string;
  description?: string;
  emoji: string;
  isAgent?: boolean;
}> = {
  // === 경영진 ===
  'owner': {
    label: '대표이사', emoji: '👤', isAgent: false,
    color: 'bg-red-50 text-red-700 border-red-200',
    accent: 'border-red-400', bg: 'from-red-50',
    description: '전사 전략 방향 설정 및 최종 의사결정',
  },

  // === 팀장급 (실명 + 실제 직책) ===
  'strategy-lead': {
    name: '이준혁', label: '이준혁', emoji: '🧠', isAgent: true,
    color: 'from-purple-500 to-indigo-600',
    accent: 'border-purple-500', bg: 'from-purple-50',
    description: '수석 전략고문 · 전략기획',
  },
  'infra-lead': {
    name: '박태성', label: '박태성', emoji: '⚙️', isAgent: true,
    color: 'from-slate-500 to-gray-600',
    accent: 'border-slate-400', bg: 'from-slate-50',
    description: '시스템 엔지니어링 리드 · 인프라',
  },
  'career-lead': {
    name: '김서연', label: '김서연', emoji: '📈', isAgent: true,
    color: 'from-emerald-500 to-teal-600',
    accent: 'border-emerald-400', bg: 'from-emerald-50',
    description: '성장전략 매니저 · 성장팀',
  },
  'brand-lead': {
    name: '정하은', label: '정하은', emoji: '✨', isAgent: true,
    color: 'from-pink-500 to-rose-600',
    accent: 'border-pink-400', bg: 'from-pink-50',
    description: '브랜드 & 콘텐츠 디렉터 · 브랜드팀',
  },
  'academy-lead': {
    name: '최인수', label: '최인수', emoji: '📚', isAgent: true,
    color: 'from-amber-500 to-orange-600',
    accent: 'border-amber-400', bg: 'from-amber-50',
    description: '리서치 & 학술 디렉터 · 학술팀',
  },
  'record-lead': {
    name: '한소희', label: '한소희', emoji: '📝', isAgent: true,
    color: 'from-cyan-500 to-blue-600',
    accent: 'border-cyan-400', bg: 'from-cyan-50',
    description: '기록 & 지식관리 리드 · 기록팀',
  },

  // === 실무 담당 ===
  'infra-team': {
    label: '인프라 엔지니어', emoji: '🔧', isAgent: true,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    accent: 'border-blue-400', bg: 'from-blue-50',
    description: '서버 운영, 배포 자동화, 시스템 안정성 관리',
  },
  'brand-team': {
    label: '브랜드 크리에이터', emoji: '📣', isAgent: true,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    accent: 'border-purple-400', bg: 'from-purple-50',
    description: '콘텐츠 제작, 메시지 기획, 채널 운영',
  },
  'record-team': {
    label: '기록 분석가', emoji: '🗄️', isAgent: true,
    color: 'bg-green-50 text-green-700 border-green-200',
    accent: 'border-green-400', bg: 'from-green-50',
    description: '활동 기록, 인사이트 아카이브, 지식 문서화',
  },
  'trend-team': {
    label: '시장조사 분석가', emoji: '📡', isAgent: true,
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    accent: 'border-cyan-400', bg: 'from-cyan-50',
    description: '업계 트렌드, 경쟁사 동향, 시장 데이터 분석',
  },
  'growth-team': {
    label: '사업개발 담당', emoji: '🚀', isAgent: true,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    accent: 'border-orange-400', bg: 'from-orange-50',
    description: '신규 사업 기회 발굴, 파트너십, 성장 실험',
  },
  'academy-team': {
    label: '교육콘텐츠 담당', emoji: '📖', isAgent: true,
    color: 'bg-pink-50 text-pink-700 border-pink-200',
    accent: 'border-pink-400', bg: 'from-pink-50',
    description: '교육 콘텐츠 제작, 학습 커리큘럼 운영',
  },
  'audit-team': {
    label: '감사 & 컴플라이언스', emoji: '🔍', isAgent: true,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    accent: 'border-amber-400', bg: 'from-amber-50',
    description: '규정 준수, 리스크 관리, 내부 감사',
  },

  // === AI 시스템 ===
  'dev-runner': {
    label: 'AI 자동화 시스템', emoji: '🤖', isAgent: true,
    color: 'bg-gray-100 text-gray-600 border-gray-300',
    accent: 'border-gray-400', bg: 'from-gray-50',
    description: '자동화 스크립트 실행, 배치 작업, 시스템 태스크',
  },
  'jarvis-proposer': {
    name: 'Jarvis AI', label: 'Jarvis AI', emoji: '🤖', isAgent: true,
    color: 'from-violet-500 to-purple-600',
    accent: 'border-violet-400', bg: 'from-violet-50',
    description: 'AI 자동화 제안 및 데이터 기반 분석',
  },
  'board-synthesizer': {
    name: '이사회 의사록', label: '이사회 의사록', emoji: '📋', isAgent: true,
    color: 'from-yellow-500 to-amber-600',
    accent: 'border-yellow-400', bg: 'from-yellow-50',
    description: '이사회 토론 종합 정리 및 의사결정 기록',
  },
  'council-team': {
    name: '전략기획 위원회', label: '전략기획 위원회', emoji: '🏛️', isAgent: true,
    color: 'from-yellow-500 to-amber-600',
    accent: 'border-yellow-400', bg: 'from-yellow-50',
    description: '전사 의사결정 종합 검토 및 전략 자문',
  },
};

export const TYPE_LABELS: Record<string, string> = {
  decision: '결정', discussion: '논의', issue: '이슈', inquiry: '문의',
};

export const TYPE_COLOR: Record<string, string> = {
  decision: 'bg-blue-50 text-blue-700 border-blue-200',
  discussion: 'bg-gray-100 text-gray-600 border-gray-200',
  issue: 'bg-red-50 text-red-700 border-red-200',
  inquiry: 'bg-purple-50 text-purple-700 border-purple-200',
};

export const PRIORITY_BADGE: Record<string, string> = {
  urgent: '🔴 긴급', high: '🟠 높음', medium: '', low: '',
};

export const STATUS_DOT: Record<string, string> = {
  open: 'bg-emerald-500', 'in-progress': 'bg-amber-400',
  'conclusion-pending': 'bg-red-500', resolved: 'bg-gray-400',
};

export const STATUS_LABEL: Record<string, string> = {
  open: '토론중', 'in-progress': '진행중',
  'conclusion-pending': '결론 대기', resolved: '결론',
};

export const STATUS_COLOR: Record<string, string> = {
  open: 'text-emerald-600', 'in-progress': 'text-amber-600',
  'conclusion-pending': 'text-red-600', resolved: 'text-gray-400',
};

export const STATUS_STYLE: Record<string, string> = {
  open: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  'in-progress': 'text-amber-600 bg-amber-50 border-amber-200',
  'conclusion-pending': 'text-red-600 bg-red-50 border-red-300 font-semibold',
  resolved: 'text-zinc-500 bg-zinc-100 border-zinc-200',
};

export const DISCUSSION_WINDOW_MS = 30 * 60 * 1000;

export const TYPE_ICON: Record<string, string> = {
  decision: '✅',
  discussion: '💬',
  issue: '🔴',
  inquiry: '❓',
};
