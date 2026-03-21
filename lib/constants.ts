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
    name: '이정우', label: '이정우', emoji: '👤', isAgent: false,
    color: 'bg-red-50 text-red-700 border-red-200',
    accent: 'border-red-400', bg: 'from-red-50',
    description: '대표이사 · 전사 전략 방향 설정 및 최종 의사결정',
  },

  // === 임원진 ===
  'kim-seonhwi': {
    name: '김선휘', label: '김선휘', emoji: '💡', isAgent: true,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    accent: 'border-orange-400', bg: 'from-orange-50',
    description: '최고기술책임자(CTO) · 기술전략 총괄',
  },
  'jung-mingi': {
    name: '정민기', label: '정민기', emoji: '⚡', isAgent: true,
    color: 'bg-sky-50 text-sky-700 border-sky-300',
    accent: 'border-sky-500', bg: 'from-sky-50',
    description: '최고운영책임자(COO) · 사업운영 총괄',
  },
  'lee-jihwan': {
    name: '이지환', label: '이지환', emoji: '🎯', isAgent: true,
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    accent: 'border-violet-500', bg: 'from-violet-50',
    description: '최고전략책임자(CSO) · 전사전략 총괄',
  },

  // === 팀장급 (실명 + 실제 직책) ===
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
    description: '성장전략 리드 · 성장팀',
  },
  'brand-lead': {
    name: '정하은', label: '정하은', emoji: '✨', isAgent: true,
    color: 'from-pink-500 to-rose-600',
    accent: 'border-pink-400', bg: 'from-pink-50',
    description: '브랜드 디렉터 · 브랜드팀',
  },
  'finance-lead': {
    name: '오민준', label: '오민준', emoji: '💰', isAgent: true,
    color: 'from-green-600 to-emerald-700',
    accent: 'border-green-500', bg: 'from-green-50',
    description: '재무/투자 분석가 · 재무팀',
  },
  'record-lead': {
    name: '한소희', label: '한소희', emoji: '📝', isAgent: true,
    color: 'from-cyan-500 to-blue-600',
    accent: 'border-cyan-400', bg: 'from-cyan-50',
    description: '지식관리 리드 · 기록팀',
  },

  // === 실무 담당 ===
  'infra-team': {
    name: '윤성진', label: '윤성진', emoji: '🔧', isAgent: true,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    accent: 'border-blue-400', bg: 'from-blue-50',
    description: '인프라 엔지니어 · 서버 운영, 배포 자동화, 시스템 안정성 관리',
  },
  'brand-team': {
    name: '최예린', label: '최예린', emoji: '📣', isAgent: true,
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    accent: 'border-purple-400', bg: 'from-purple-50',
    description: '브랜드 크리에이터 · 콘텐츠 제작, 메시지 기획, 채널 운영',
  },
  'record-team': {
    name: '임도현', label: '임도현', emoji: '🗄️', isAgent: true,
    color: 'bg-green-50 text-green-700 border-green-200',
    accent: 'border-green-400', bg: 'from-green-50',
    description: '기록 분석가 · 활동 기록, 인사이트 아카이브, 지식 문서화',
  },
  'trend-team': {
    name: '강나연', label: '강나연', emoji: '📡', isAgent: true,
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    accent: 'border-cyan-400', bg: 'from-cyan-50',
    description: '시장조사 분석가 · 업계 트렌드, 경쟁사 동향, 시장 데이터 분석',
  },
  'growth-team': {
    name: '배준서', label: '배준서', emoji: '🚀', isAgent: true,
    color: 'bg-orange-50 text-orange-700 border-orange-200',
    accent: 'border-orange-400', bg: 'from-orange-50',
    description: '사업개발 담당 · 신규 사업 기회 발굴, 파트너십, 성장 실험',
  },
  'academy-team': {
    name: '신유진', label: '신유진', emoji: '📖', isAgent: true,
    color: 'bg-pink-50 text-pink-700 border-pink-200',
    accent: 'border-pink-400', bg: 'from-pink-50',
    description: '교육콘텐츠 담당 · 교육 콘텐츠 제작, 학습 커리큘럼 운영',
  },
  'audit-team': {
    name: '류태환', label: '류태환', emoji: '🔍', isAgent: true,
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    accent: 'border-amber-400', bg: 'from-amber-50',
    description: '감사 & 컴플라이언스 · 규정 준수, 리스크 관리, 내부 감사',
  },
  'llm-critic': {
    name: '권태민', label: '권태민', emoji: '🧪', isAgent: true,
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    accent: 'border-indigo-400', bg: 'from-indigo-50',
    description: 'AI 품질 엔지니어 · LLM 프롬프트 설계, 모델 선택, RAG 정확도 검토',
  },
  'devops-team': {
    name: '윤재호', label: '윤재호', emoji: '🛠️', isAgent: true,
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    accent: 'border-slate-400', bg: 'from-slate-50',
    description: 'DevOps 엔지니어 · CI/CD 파이프라인, 배포 자동화, 인프라 코드화',
  },
  'finance-team': {
    name: '이수연', label: '이수연', emoji: '📊', isAgent: true,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accent: 'border-emerald-400', bg: 'from-emerald-50',
    description: '재무기획 담당 · 예산 수립, 비용 분석, 재무 보고서 작성',
  },
  'product-team': {
    name: '차민준', label: '차민준', emoji: '🔬', isAgent: true,
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    accent: 'border-violet-400', bg: 'from-violet-50',
    description: 'AI 프로덕트 매니저 · AI 기능 기획, 사용자 요구사항 분석, 로드맵 관리',
  },
  'data-team': {
    name: '박서린', label: '박서린', emoji: '📉', isAgent: true,
    color: 'bg-teal-50 text-teal-700 border-teal-200',
    accent: 'border-teal-400', bg: 'from-teal-50',
    description: '데이터 분석가 · 사용자 행동 분석, 성장 지표 관리, 데이터 대시보드',
  },

  // === AI 시스템 ===
  'jarvis-coder': {
    label: 'Jarvis Coder', emoji: '⚙️', isAgent: true,
    color: 'bg-gray-100 text-gray-600 border-gray-300',
    accent: 'border-gray-400', bg: 'from-gray-50',
    description: '자율 코딩 에이전트 — 이사회 결의를 코드로 자동 구현',
  },
  'dev-runner': {
    label: 'Jarvis Coder', emoji: '⚙️', isAgent: true,
    color: 'bg-gray-100 text-gray-600 border-gray-300',
    accent: 'border-gray-400', bg: 'from-gray-50',
    description: '자율 코딩 에이전트 — 이사회 결의를 코드로 자동 구현',
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
  // 신규 유형 (도메인 기반)
  strategy: '전략', tech: '기술', ops: '운영', risk: '리스크', review: '성과',
  report: '보고서',
  // 레거시 (기존 데이터 호환)
  decision: '결정', discussion: '논의', issue: '이슈', inquiry: '문의',
};

export const TYPE_COLOR: Record<string, string> = {
  // 신규 유형
  strategy: 'bg-violet-50 text-violet-700 border-violet-200',
  tech:     'bg-blue-50 text-blue-700 border-blue-200',
  ops:      'bg-teal-50 text-teal-700 border-teal-200',
  risk:     'bg-red-50 text-red-700 border-red-200',
  review:   'bg-amber-50 text-amber-700 border-amber-200',
  // 레거시
  decision:   'bg-blue-50 text-blue-600 border-blue-200',
  discussion: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  issue:      'bg-red-50 text-red-600 border-red-200',
  inquiry:    'bg-purple-50 text-purple-600 border-purple-200',
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
  'conclusion-pending': '마감됨', resolved: '마감',
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

export function getDiscussionWindow(type: string): number {
  const windows: Record<string, number> = {
    // 신규 유형
    strategy: 24 * 60 * 60 * 1000,   // 24시간 — 전략 결정은 충분한 숙의 필요
    tech:      4 * 60 * 60 * 1000,   // 4시간
    ops:       4 * 60 * 60 * 1000,   // 4시간
    risk:     30 * 60 * 1000,        // 30분 — 리스크는 신속 대응
    review:    8 * 60 * 60 * 1000,   // 8시간
    // 레거시
    issue:    30 * 60 * 1000,
    inquiry:  60 * 60 * 1000,
    discussion: 30 * 60 * 1000,
    decision: 24 * 60 * 60 * 1000,
  };
  return windows[type] ?? DISCUSSION_WINDOW_MS;
}

export const MIN_COMMENT_LENGTH = 5;

export const TYPE_ICON: Record<string, string> = {
  // 신규 유형
  strategy: '🎯',
  tech:     '⚙️',
  ops:      '🔄',
  risk:     '⚠️',
  review:   '📊',
  report:   '📊',
  // 레거시
  decision:   '✅',
  discussion: '💬',
  issue:      '🔴',
  inquiry:    '❓',
};
