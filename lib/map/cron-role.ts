/* ═══════════════════════════════════════════════════════════════════
   Jarvis MAP — Cron role inference + token/cost helpers
   Extracted from app/company/VirtualOffice.tsx (pure logic, no React)
   ═══════════════════════════════════════════════════════════════════ */

// 토큰 사용량 패턴 감지 (lastMessage 파싱)
export function detectTokenUsage(msg: string): { input: number; output: number; total: number } | null {
  if (!msg) return null;
  const iM = msg.match(/input[_\s]?tokens?[=:\s]+(\d+)/i);
  const oM = msg.match(/output[_\s]?tokens?[=:\s]+(\d+)/i);
  const tM = msg.match(/total[_\s]?tokens?[=:\s]+(\d+)/i) || msg.match(/tokens?[=:\s]+(\d{4,})/i);
  if (!iM && !oM && !tM) return null;
  const input  = iM ? parseInt(iM[1])  : 0;
  const output = oM ? parseInt(oM[1])  : 0;
  const total  = tM ? parseInt(tM[1])  : input + output;
  if (total === 0 && input === 0 && output === 0) return null;
  return { input, output, total };
}

export function estimateCost(u: { input: number; output: number; total: number }): string {
  // Sonnet 기준: input $3/1M, output $15/1M
  const usd = (u.input / 1_000_000) * 3 + (u.output / 1_000_000) * 15;
  if (usd < 0.0001) {
    const est = u.total > 0 ? (u.total / 1_000_000) * 9 : 0; // avg
    return est < 0.0001 ? '<$0.0001' : `~$${est.toFixed(4)}`;
  }
  return `$${usd.toFixed(4)}`;
}

// 크론 ID → 역할 설명 추론 (ID 파싱 기반)
export function inferCronRole(id: string): string {
  const L = id.toLowerCase();
  const PATTERNS: Array<[RegExp, string]> = [
    [/tqqq/,                            'TQQQ ETF 가격 추적 및 매매 신호 감지'],
    [/market.*monitor|finance.*monitor/, '주식·금융 시장 데이터 수집 및 분석'],
    [/github.*star|star.*tracker/,      'GitHub 스타 현황 추적'],
    [/github.*monitor/,                 'GitHub 저장소 활동 모니터링'],
    [/news/,                            '뉴스 헤드라인 수집 및 요약'],
    [/trend/,                           '기술·시장 트렌드 분석 리포트 생성'],
    [/macro/,                           '거시경제 지표 수집 및 분석'],
    [/recon/,                           '시장·경쟁사 정보 정보탐험'],
    [/calendar.*alert/,                 '캘린더 일정 사전 알림'],
    [/personal.*schedule/,              '개인 일정 확인 및 알림'],
    [/stock/,                           '주식 포트폴리오 모니터링'],
    [/blog/,                            '기술 블로그 포스트 관리'],
    [/oss|openclaw/,                    '오픈소스(openclaw) 기여 모니터링'],
    [/brand/,                           '브랜드 성장 지표 추적'],
    [/github.*star/,                    'GitHub 스타 트래킹'],
    [/disk/,                            '디스크 사용량 모니터링 및 알림'],
    [/memory.*cleanup/,                 '메모리 캐시 정리 및 최적화'],
    [/log.*cleanup/,                    '로그 파일 정리 (오래된 로그 삭제)'],
    [/system.*health|health/,           '시스템 건강 종합 진단'],
    [/system.*doctor|doctor/,           '시스템 자가진단 및 이상 감지'],
    [/token.*sync/,                     'API 사용 토큰 동기화'],
    [/daily.*usage|usage.*check/,       '일일 API 사용량 점검'],
    [/cost.*monitor/,                   'Claude API 비용 모니터링'],
    [/rate.*limit/,                     'API 요청 제한 관리'],
    [/security.*scan/,                  '보안 취약점 자동 스캔'],
    [/glances/,                         '실시간 시스템 리소스 모니터링 (CPU/메모리/디스크)'],
    [/aggregate.*metric/,               '시스템 메트릭 집계 및 저장'],
    [/sync.*metric/,                    '시스템 메트릭 동기화'],
    [/update.*usage/,                   '사용량 캐시 업데이트'],
    [/scorecard/,                       '시스템 점수카드 평가'],
    [/record|memory(?!.*clean)/,        '대화·이벤트 기록 저장 및 정리'],
    [/rag/,                             'RAG 벡터 DB 인덱싱 및 최신화'],
    [/session/,                         '세션 로그 기록 관리'],
    [/vault/,                           '보안 저장소 데이터 관리'],
    [/gen.*system.*overview/,           '시스템 전체 개요 문서 자동 생성'],
    [/career|job.*search/,              '이직 준비 및 채용공고 추적'],
    [/interview/,                       '면접 질문 생성 및 기술 연습'],
    [/isg|growth/,                      '커리어 성장 지표 및 전략 분석'],
    [/commitment/,                      'GitHub 커밋 이력 분석'],
    [/academy|learning|study/,          '기술 학습 자료 생성 및 스터디 플랜'],
    [/boram/,                           '아내 관련 일정·정보 관리'],
    [/lecture/,                         '강의 자료 큐레이션'],
    [/audit|kpi/,                       'KPI 지표 집계 및 내부 감사'],
    [/cron.*auditor/,                   '크론잡 성과 감사 및 연속 실패 탐지'],
    [/bot.*quality|quality/,            '봇 응답 품질 평가'],
    [/e2e/,                             'E2E 테스트 자동 실행'],
    [/regression/,                      '시스템 회귀 테스트'],
    [/doc.*sync/,                       '문서 자동 동기화'],
    [/stale.*task/,                     '오래된 미처리 태스크 정리'],
    [/auto.*diagnose/,                  '자동 장애 진단'],
    [/skill.*eval/,                     '봇 스킬 평가'],
    [/rag.*bench/,                      'RAG 검색 품질 벤치마크'],
    [/standup|morning/,                 '모닝 스탠드업 브리핑 생성'],
    [/daily.*summary/,                  '일일 전사 요약 리포트'],
    [/board.*ceo|ceo.*council/,         'CEO 경영 보고서 생성'],
    [/weekly.*code.*review/,            '주간 코드 리뷰 자동화'],
    [/memory.*expire/,                  '만료된 장기 기억 정리'],
    [/weekly.*usage|usage.*stats/,      '주간 사용량 통계 리포트'],
    [/connections.*weekly/,             '주간 인맥 네트워크 관리'],
    [/private.*sync/,                   '개인 데이터 동기화'],
    [/schedule.*coherence/,             '일정 일관성 점검'],
    [/monthly.*review/,                 '월간 경영 리뷰 생성'],
    [/dev.*runner|jarvis.*coder/,       '자동 개발 태스크 실행'],
    [/agent.*batch/,                    '에이전트 배치 처리'],
  ];
  for (const [pattern, desc] of PATTERNS) {
    if (pattern.test(L)) return desc;
  }
  // 세그먼트 기반 추론
  const parts = L.replace(/[-_]/g, ' ').split(' ').filter(Boolean);
  const verbs: Record<string, string> = {
    monitor: '모니터링', check: '점검', sync: '동기화', scan: '스캔',
    audit: '감사', cleanup: '정리', update: '업데이트', generate: '생성',
    collect: '수집', alert: '알림', report: '리포트', send: '전송',
    fetch: '수집', run: '실행', batch: '배치 처리',
  };
  const nouns: Record<string, string> = {
    system: '시스템', log: '로그', data: '데이터', usage: '사용량',
    bot: '봇', server: '서버', agent: '에이전트', task: '태스크',
    token: '토큰', metric: '메트릭', job: '잡',
  };
  const verbHits = parts.filter(p => verbs[p]).map(p => verbs[p]);
  const nounHits = parts.filter(p => nouns[p]).map(p => nouns[p]);
  if (verbHits.length > 0 || nounHits.length > 0) {
    return `${nounHits.join('·')} ${verbHits.join('·')} 자동화 태스크`.trim();
  }
  return '';
}
