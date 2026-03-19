export const AUTHOR_META: Record<string, {
  label: string;
  color: string;
  accent: string;
  bg: string;
  description: string;
  emoji: string;
}> = {
  'infra-team':   {
    label: '인프라팀', emoji: '⚙️',
    color: 'bg-blue-900/50 text-blue-300 border-blue-800',
    accent: 'border-blue-500', bg: 'from-blue-500/10',
    description: '시스템 안정성, 배포, 서버 운영을 담당합니다',
  },
  'audit-team':   {
    label: '감사팀', emoji: '🔍',
    color: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
    accent: 'border-yellow-500', bg: 'from-yellow-500/10',
    description: '코드 품질 검사, 보안 감사, 규정 준수를 담당합니다',
  },
  'brand-team':   {
    label: '브랜드팀', emoji: '📣',
    color: 'bg-purple-900/50 text-purple-300 border-purple-800',
    accent: 'border-purple-500', bg: 'from-purple-500/10',
    description: '브랜드 전략, 마케팅, 외부 커뮤니케이션을 담당합니다',
  },
  'record-team':  {
    label: '기록팀', emoji: '🗄️',
    color: 'bg-green-900/50 text-green-300 border-green-800',
    accent: 'border-green-500', bg: 'from-green-500/10',
    description: '활동 기록, 문서화, 인사이트 아카이브를 담당합니다',
  },
  'trend-team':   {
    label: '정보팀', emoji: '📡',
    color: 'bg-cyan-900/50 text-cyan-300 border-cyan-800',
    accent: 'border-cyan-500', bg: 'from-cyan-500/10',
    description: '트렌드 분석, 시장 조사, 정보 수집을 담당합니다',
  },
  'growth-team':  {
    label: '성장팀', emoji: '🚀',
    color: 'bg-orange-900/50 text-orange-300 border-orange-800',
    accent: 'border-orange-500', bg: 'from-orange-500/10',
    description: '사업 성장, 신규 기회 발굴, 파트너십을 담당합니다',
  },
  'academy-team': {
    label: '학습팀', emoji: '📚',
    color: 'bg-pink-900/50 text-pink-300 border-pink-800',
    accent: 'border-pink-500', bg: 'from-pink-500/10',
    description: '교육 콘텐츠, 지식 베이스, 팀 역량 강화를 담당합니다',
  },
  'dev-runner':   {
    label: 'Dev Runner', emoji: '🤖',
    color: 'bg-gray-800 text-gray-300 border-gray-700',
    accent: 'border-gray-400', bg: 'from-gray-500/10',
    description: '자동화 스크립트 실행, 배치 작업, 시스템 태스크를 담당합니다',
  },
  'owner':        {
    label: '대표', emoji: '👤',
    color: 'bg-red-900/50 text-red-300 border-red-800',
    accent: 'border-red-500', bg: 'from-red-500/10',
    description: '최종 의사결정, 전략 방향 설정, 팀 전체 조율을 담당합니다',
  },
};

export const TYPE_LABELS: Record<string, string> = {
  decision: '결정', discussion: '논의', issue: '이슈', inquiry: '문의',
};

export const TYPE_COLOR: Record<string, string> = {
  decision: 'bg-blue-900/40 text-blue-300 border-blue-800',
  discussion: 'bg-gray-800 text-gray-300 border-gray-700',
  issue: 'bg-red-900/40 text-red-300 border-red-800',
  inquiry: 'bg-purple-900/40 text-purple-300 border-purple-700',
};

export const PRIORITY_BADGE: Record<string, string> = {
  urgent: '🔴 긴급', high: '🟠 높음', medium: '', low: '',
};

export const STATUS_DOT: Record<string, string> = {
  open: 'bg-green-400', 'in-progress': 'bg-yellow-400', resolved: 'bg-gray-600',
};

export const STATUS_LABEL: Record<string, string> = {
  open: '대기', 'in-progress': '처리중', resolved: '해결됨',
};

export const STATUS_COLOR: Record<string, string> = {
  open: 'text-green-400', 'in-progress': 'text-yellow-400', resolved: 'text-gray-500',
};

export const TYPE_ICON: Record<string, string> = {
  decision: '✅',
  discussion: '💬',
  issue: '🔴',
  inquiry: '❓',
};
