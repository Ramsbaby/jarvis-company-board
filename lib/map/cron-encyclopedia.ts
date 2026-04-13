/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Cron Encyclopedia (SSoT for deep descriptions + CEO actions)
   crontab ID → 카테고리 → "이 크론이 뭐하는 놈인지 + CEO가 뭘 할 수 있는지"
   UI 관점: CronDetailPopup 에서 사용. tasks.json 의 description 과는 별도로,
   "CEO가 이 크론 앞에서 내릴 수 있는 실제 액션"을 제공하는 게 목적이다.
   ═══════════════════════════════════════════════════════════════════ */

export type CeoActionWhen = 'always' | 'success' | 'failed' | 'stale';
export type CeoActionKind = 'copy' | 'info' | 'link';

export interface CeoAction {
  label: string;
  kind: CeoActionKind;
  when: CeoActionWhen;
  /** kind === 'copy' 일 때 복사할 커맨드/텍스트. 'link'일 때 이동 URL. 'info'일 때 무시 */
  target?: string;
  description: string;
}

export interface CronDeepInfo {
  category: string;
  emoji: string;
  /** "이 크론이 실제로 하는 일" — bullet 리스트 */
  whatItDoes: string[];
  /** "언제 유용한지 / 어떤 결정을 내리는 데 쓰는지" */
  whenUseful: string[];
  /** "CEO가 이 앞에서 취할 수 있는 액션" */
  ceoActions: CeoAction[];
}

// ── 카테고리 SSoT ─────────────────────────────────────────────────
interface CategoryDef {
  key: string;
  label: string;
  emoji: string;
  match: RegExp;
  info: Omit<CronDeepInfo, 'category' | 'emoji'>;
}

const CATEGORIES: CategoryDef[] = [
  // ── 시스템 인프라 ────────────────────────────────────────────
  {
    key: 'infra-health',
    label: '시스템 인프라 점검',
    emoji: '⚙️',
    match: /disk|system[-_]?(health|doctor)|infra[-_]?daily|glances|aggregate[-_]?metric|memory[-_]?cleanup|log[-_]?cleanup|security[-_]?scan|rate[-_]?limit|update[-_]?usage|scorecard|health/,
    info: {
      whatItDoes: [
        'Mac Mini 서버의 CPU/메모리/디스크 상태와 프로세스 헬스를 주기적으로 측정합니다.',
        '임계치를 넘으면 Discord `#jarvis-system` 채널에 경고를 발송합니다.',
        'cron.log에 단일 라인 결과를 남기고, 24시간 성공률 집계에 반영됩니다.',
      ],
      whenUseful: [
        '봇 응답이 느리거나 빌드가 실패하기 시작할 때 가장 먼저 볼 지표입니다.',
        '디스크가 80% 이상이면 RAG 인덱스 / 로그 기록 자체가 실패할 수 있습니다.',
      ],
      ceoActions: [
        { label: 'SRE실(박태성) 브리핑 열기', kind: 'info', when: 'always', description: '좌측 SRE실 카드를 눌러 팀장 브리핑으로 이동합니다.' },
        { label: '수동 디스크 정리 커맨드 복사', kind: 'copy', when: 'failed', target: 'bash ~/.jarvis/scripts/log-cleanup.sh', description: '안전하게 로그/캐시만 정리하는 전용 스크립트입니다.' },
        { label: '실시간 리소스 대시보드', kind: 'copy', when: 'always', target: 'glances', description: '터미널에서 Mac Mini CPU/Mem/Disk/네트워크를 실시간 확인합니다.' },
        { label: '디스크 Top 사용자 찾기', kind: 'copy', when: 'failed', target: 'sudo du -ah / 2>/dev/null | sort -rh | head -20', description: '가장 많이 차지하는 파일 20개를 뽑아봅니다.' },
      ],
    },
  },

  // ── 재무 / 시장 ──────────────────────────────────────────────
  {
    key: 'finance-market',
    label: '재무 · 시장 모니터링',
    emoji: '💰',
    match: /tqqq|market[-_]?alert|stock|macro|finance[-_]?monitor|cost[-_]?monitor|preply|personal[-_]?schedule|boram/,
    info: {
      whatItDoes: [
        'TQQQ/시장 지표 변동을 감시하고 매수/매도 신호를 Discord `#jarvis-ceo` 로 알립니다.',
        'Claude API 비용과 개인 수입(Preply 등)을 합쳐 CFO 관점의 일일 리포트를 만듭니다.',
      ],
      whenUseful: [
        '시장 하락기 진입 여부 판단, 추가 매수 타이밍 포착.',
        '이번 주/월 AI 운영비 vs 수입 차감표를 바로 볼 때.',
      ],
      ceoActions: [
        { label: '재무실(장원석) 브리핑 열기', kind: 'info', when: 'always', description: '맵에서 재무실을 클릭하면 통합 대시보드로 이동합니다.' },
        { label: 'TQQQ 실시간 체크', kind: 'copy', when: 'always', target: 'curl -s "https://query1.finance.yahoo.com/v7/finance/quote?symbols=TQQQ" | jq .', description: 'Yahoo Finance에서 TQQQ 현재가를 직접 조회합니다.' },
        { label: 'Claude 비용 대시보드', kind: 'copy', when: 'always', target: 'bash ~/.jarvis/scripts/claude-cost-report.sh', description: '최근 7일 토큰 비용 요약을 터미널에 찍습니다.' },
      ],
    },
  },

  // ── 뉴스 / 트렌드 / GitHub ──────────────────────────────────
  {
    key: 'trend-news',
    label: '뉴스 · 트렌드 인텔리전스',
    emoji: '📡',
    match: /news|trend|github[-_]?(monitor|star)|calendar[-_]?alert|recon/,
    info: {
      whatItDoes: [
        'RSS/HackerNews/Reddit에서 기술 동향을 수집 후 Claude로 요약·분류합니다.',
        '평일 오전 브리핑에 제공할 TOP N 헤드라인을 RAG 장기기억에 저장합니다.',
      ],
      whenUseful: [
        '아침 스탠드업 전 "오늘 시장이 어디로 가고 있나" 한 줄로 파악할 때.',
        '경쟁사·오픈소스 업데이트를 놓치지 않기 위해.',
      ],
      ceoActions: [
        { label: '전략기획실(강나연) 브리핑 열기', kind: 'info', when: 'always', description: '전략기획실 카드를 누르면 해당 팀장 브리핑이 열립니다.' },
        { label: 'RAG 에서 오늘 뉴스 검색', kind: 'copy', when: 'success', target: 'curl -sX POST http://localhost:8765/query -d \'{"query":"오늘 주요 뉴스","topk":5}\'', description: 'Jarvis RAG 게이트웨이에서 오늘자 저장된 뉴스 청크를 꺼냅니다.' },
      ],
    },
  },

  // ── RAG / 데이터 ─────────────────────────────────────────────
  {
    key: 'rag-data',
    label: 'RAG · 데이터 · 메모리',
    emoji: '🗄️',
    match: /rag|record|memory(?!.*cleanup)|session|vault|gen[-_]?system[-_]?overview/,
    info: {
      whatItDoes: [
        '대화 로그/문서/세션 요약을 벡터화해 LanceDB에 인덱싱합니다.',
        '중복/오래된 청크를 만료시키고 품질 벤치마크를 돌립니다.',
      ],
      whenUseful: [
        '장기기억 검색이 엉뚱한 답을 줄 때 원인 파악의 출발점.',
        '오늘 쌓인 대화/메모가 아카이브됐는지 확인할 때.',
      ],
      ceoActions: [
        { label: '데이터실(한소희) 브리핑 열기', kind: 'info', when: 'always', description: '데이터실 팀장 카드로 이동합니다.' },
        { label: 'RAG 헬스체크', kind: 'copy', when: 'failed', target: 'bash ~/.jarvis/scripts/rag-health.sh', description: 'LanceDB 상태와 청크 수를 빠르게 점검합니다.' },
        { label: '인덱스 재구축', kind: 'copy', when: 'failed', target: 'bash ~/.jarvis/scripts/rag-index-safe.sh', description: '안전 모드로 인덱스를 재빌드합니다 (DB 삭제 없음).' },
      ],
    },
  },

  // ── 품질 / 감사 ──────────────────────────────────────────────
  {
    key: 'qa-audit',
    label: 'QA · 감사 · 품질',
    emoji: '🔍',
    match: /audit|kpi|e2e|regression|doc[-_]?sync|cron[-_]?failure|stale[-_]?task|bot[-_]?quality|bot[-_]?self[-_]?critique|auto[-_]?diagnose|skill[-_]?eval|cron[-_]?auditor|code[-_]?auditor|roi/,
    info: {
      whatItDoes: [
        '자동화 태스크 성공률, 문서-코드 정합성, 봇 응답 품질을 정기 측정합니다.',
        '연속 실패 3회 이상인 태스크는 circuit-breaker로 격리됩니다.',
      ],
      whenUseful: [
        '"요즘 뭔가 삐걱거리는데 뭐 때문이지?"를 데이터로 대답해줍니다.',
        '주간/월간 회고 시 성과 추이 기반의 의사결정에 사용.',
      ],
      ceoActions: [
        { label: 'QA실(류태환) 브리핑 열기', kind: 'info', when: 'always', description: 'QA실 카드로 이동해 감사 결과와 최근 회귀를 확인합니다.' },
        { label: '전체 E2E 테스트', kind: 'copy', when: 'always', target: 'bash ~/.jarvis/scripts/e2e-test.sh', description: '50개 항목 자동 검증. 5분 내외.' },
        { label: 'circuit-breaker 상태 확인', kind: 'copy', when: 'failed', target: 'ls -la ~/.jarvis/state/circuit-breaker/', description: '현재 격리된 태스크 목록을 봅니다.' },
      ],
    },
  },

  // ── 커리어 / 학습 / 인재개발 ─────────────────────────────────
  {
    key: 'career-growth',
    label: '커리어 · 학습 · 인재개발',
    emoji: '🌱',
    match: /career|job|resume|interview|isg|growth|academy|learning|study|commitment|lecture/,
    info: {
      whatItDoes: [
        '이직/면접/학습 데이터를 수집·정리해 커리어 맵을 매일 갱신합니다.',
        '면접 질답 릴레이, 이력서 버전 관리, 학습 자료 큐레이션이 포함됩니다.',
      ],
      whenUseful: [
        '면접 D-day 카운트다운, STAR/꼬리질문 보강 리스트가 필요할 때.',
        '이력서가 최신인지, 이번 주 학습 목표가 뭔지 확인할 때.',
      ],
      ceoActions: [
        { label: '인재개발실(김서연) 브리핑 열기', kind: 'info', when: 'always', description: '성장실 팀장 카드로 이동합니다.' },
        { label: '이력서 미리보기', kind: 'copy', when: 'always', target: 'bash ~/.jarvis/scripts/resume-preview.sh', description: '최신 이력서를 마크다운으로 렌더링합니다.' },
      ],
    },
  },

  // ── 마케팅 / 브랜드 / OSS ────────────────────────────────────
  {
    key: 'brand-oss',
    label: '마케팅 · 브랜드 · OSS',
    emoji: '📣',
    match: /brand|blog|oss|openclaw|github[-_]?star|stars/,
    info: {
      whatItDoes: [
        '기술 블로그/GitHub 저장소/OSS 기여 지표를 집계해 브랜드 대시보드에 반영합니다.',
        '매주 화요일 08:00 주간 브랜드 리포트를 Discord `#jarvis-blog`에 발행합니다.',
      ],
      whenUseful: [
        '"이번 주에 내 브랜드가 어디까지 왔나?"를 숫자로 답할 때.',
        '어느 블로그 글이 유입이 많은지, 어떤 저장소가 별을 받고 있는지.',
      ],
      ceoActions: [
        { label: '마케팅실(정하은) 브리핑 열기', kind: 'info', when: 'always', description: '마케팅실 카드로 이동해 브랜드 지표를 봅니다.' },
        { label: 'GitHub 스타 확인', kind: 'copy', when: 'always', target: 'gh api /users/ramsbaby/repos --paginate -q \'.[] | "\\(.stargazers_count)\\t\\(.name)"\' | sort -rn | head -10', description: '본인 레포의 스타 Top 10을 봅니다.' },
      ],
    },
  },

  // ── 이사회 / CEO / 경영 ──────────────────────────────────────
  {
    key: 'executive-board',
    label: '이사회 · 경영 의사결정',
    emoji: '🏛️',
    match: /board|ceo|council|morning[-_]?standup|daily[-_]?summary|schedule[-_]?coherence|monthly[-_]?review|connections[-_]?weekly|private[-_]?sync|dev[-_]?runner|jarvis[-_]?coder|agent[-_]?batch|weekly[-_]?(code[-_]?review|usage[-_]?stats)/,
    info: {
      whatItDoes: [
        'AI 임원진(CTO/COO/CSO)이 안건을 논의하고 결정사항을 회의록으로 남깁니다.',
        '매일 아침 스탠드업, 주간/월간 리뷰를 생성해 CEO 디지털 대시보드에 올립니다.',
      ],
      whenUseful: [
        '"지금 회사가 무슨 결정을 내렸지?"를 한 줄로 알고 싶을 때.',
        '주요 이슈가 멈춰있는지(stale), 내가 뭘 놓쳤는지 파악할 때.',
      ],
      ceoActions: [
        { label: '대표실 브리핑 열기', kind: 'info', when: 'always', description: '대표실 카드를 누르면 오늘의 이사회 요약·KPI·개인 대시보드가 열립니다.' },
        { label: '오늘 스탠드업 재생성', kind: 'copy', when: 'failed', target: 'bash ~/.jarvis/scripts/morning-standup.sh', description: '모닝 브리핑 생성 스크립트를 수동 실행합니다.' },
      ],
    },
  },
];

// ── 폴백 ──────────────────────────────────────────────────────
const FALLBACK: Omit<CronDeepInfo, 'category' | 'emoji'> = {
  whatItDoes: [
    'tasks.json 에 정의된 스크립트 또는 Claude 프롬프트를 스케줄에 따라 실행합니다.',
    '실행 결과는 `~/.jarvis/logs/cron.log` 에 한 줄씩 기록됩니다.',
  ],
  whenUseful: [
    '이 태스크의 description 을 tasks.json에 추가하면 더 정확한 안내가 나옵니다.',
  ],
  ceoActions: [
    { label: 'tasks.json 에서 정의 확인', kind: 'copy', when: 'always', target: 'cat ~/.jarvis/config/tasks.json | jq \'.tasks[] | select(.id=="__ID__")\'', description: '__ID__ 자리에 실제 태스크 ID를 넣어 정의를 확인합니다.' },
  ],
};

export function getCronDeepInfo(cronId: string): CronDeepInfo {
  const L = cronId.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.match.test(L)) {
      return {
        category: cat.label,
        emoji: cat.emoji,
        ...cat.info,
      };
    }
  }
  return {
    category: '일반 자동화',
    emoji: '🔧',
    ...FALLBACK,
  };
}

/**
 * 현재 상태에 적합한 CEO 액션만 필터링.
 * 'always' 는 항상 포함. 'success' 는 성공 상태에서. 'failed' 는 실패 상태에서.
 * 'stale' 은 lastRun이 오래된 상태(예: 24시간+).
 */
export function filterCeoActionsForStatus(
  actions: CeoAction[],
  status: string,
  lastRunTs?: string | null,
): CeoAction[] {
  const isStale = (() => {
    if (!lastRunTs) return true;
    try {
      const d = new Date(lastRunTs.includes('T') ? lastRunTs : lastRunTs.replace(' ', 'T') + '+09:00');
      return (Date.now() - d.getTime()) > 24 * 3600_000;
    } catch {
      return false;
    }
  })();

  return actions.filter(a => {
    if (a.when === 'always') return true;
    if (a.when === 'success' && status === 'success') return true;
    if (a.when === 'failed' && status === 'failed') return true;
    if (a.when === 'stale' && isStale) return true;
    return false;
  });
}
