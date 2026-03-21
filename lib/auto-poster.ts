/**
 * auto-poster.ts
 * 매분 체크: 활성 토론이 없거나 30분 이상 지났으면 새 토론 자동 생성
 */
import { execFile } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';
import { nanoid } from 'nanoid';
import { callLLM, MODEL_FAST } from './llm';
import { broadcastEvent } from './sse';

const INTERVAL_MS = 60_000;      // 매 60초 체크
const CYCLE_MS    = 30 * 60_000; // 30분 주기

declare global {
  var __autoPoster: ReturnType<typeof setInterval> | undefined;
}

const FALLBACK_TOPICS = [
  {
    title: 'Discord 봇 응답 중복·패턴화 방지 전략',
    content: '## 배경\n동일 채널에서 페르소나 응답이 반복 패턴화되는 현상이 발견됩니다.\n\n## 토론 포인트\n- 같은 날 동일 주제 재응답을 막을 dedup 전략은?\n- 프롬프트 temperature·top_p 조정 vs 역할 다양화 중 어느 쪽이 효과적인가?\n- 응답 이력 요약을 컨텍스트에 주입하는 비용 대비 효과\n\n## 기대 결론\n다음 배포에 반영할 dedup 또는 다양성 확보 방안 1가지 결정',
    tags: ['Discord', '봇', '프롬프트'],
  },
  {
    title: '크론 태스크 실패율 임계값 설정 기준',
    content: '## 배경\nbot-watchdog가 침묵 15분 기준으로 재시작하지만, 크론 태스크 자체 실패율에 대한 알림 임계값이 없습니다.\n\n## 토론 포인트\n- 어떤 크론이 가장 중요도 높은가? (morning-standup vs board-topic-proposer vs rag-index)\n- 연속 실패 N회 기준 Discord 알림 vs ntfy 푸시 기준은?\n- launchd KeepAlive와 크론 중복 감시 구조의 redundancy 최적화\n\n## 기대 결론\n크론별 실패 임계값 테이블 초안 작성',
    tags: ['크론', '모니터링', '안정성'],
  },
  {
    title: 'RAG 검색 결과 관련성 저하 원인 분석',
    content: '## 배경\nLanceDB 하이브리드 검색에서 관련성 낮은 청크가 상위에 노출되는 케이스가 보고됩니다.\n\n## 토론 포인트\n- BM25 vs 벡터 가중치(현재 0.50 relevance) 재조정 필요성\n- 청크 크기(2000자) 대비 질문 길이 불일치 문제\n- 재랭킹 도입 시 응답 지연 허용 범위\n\n## 기대 결론\nRAG 검색 품질 개선을 위한 우선 실험 항목 결정',
    tags: ['RAG', '검색', 'LanceDB'],
  },
  {
    title: 'LLM 모델 선택 기준 문서화',
    content: '## 배경\nMODEL_FAST와 고성능 모델 사이의 선택이 각 스크립트마다 다르게 하드코딩되어 있습니다.\n\n## 토론 포인트\n- 태스크 유형별(요약/분류/생성/코드) 권장 모델 매트릭스 필요성\n- 비용 제한 환경에서 자동 모델 강등 로직 구현 가능성\n- tasks.json에 모델 힌트 필드 추가 여부\n\n## 기대 결론\n모델 선택 가이드라인 초안 또는 tasks.json 스키마 변경안',
    tags: ['LLM', '비용', '아키텍처'],
  },
  {
    title: 'Obsidian Vault FTS 성능 저하 대응',
    content: '## 배경\nVault 크기 증가로 Dataview 쿼리와 전체 검색 응답 속도가 느려지고 있습니다.\n\n## 토론 포인트\n- 오래된 Daily Note 아카이빙 기준(6개월? 1년?)\n- MOC 인덱스 노트 자동 생성 스크립트 도입 가능성\n- 태그 체계 정비: 현재 자유 태그 vs 제한된 온톨로지\n\n## 기대 결론\nVault 정리 규칙 또는 자동화 스크립트 설계 결정',
    tags: ['Obsidian', '지식관리', '성능'],
  },
  {
    title: 'ntfy + Discord 이중 알림 채널 최적화',
    content: '## 배경\nalert.sh가 Discord + ntfy 모두 전송하지만 중요도별 라우팅 기준이 없습니다.\n\n## 토론 포인트\n- 심각도별(INFO/WARN/CRIT) 채널 분기 기준 정의\n- Galaxy 폰 ntfy 알림 피로 방지를 위한 quiet hours 설정\n- Discord webhook 실패 시 ntfy 단독 fallback 보장 여부\n\n## 기대 결론\nalert.sh 심각도 라우팅 규칙 개정',
    tags: ['알림', 'Discord', 'ntfy'],
  },
  {
    title: '자동화 태스크 ROI 측정 프레임워크',
    content: '## 배경\n크론 태스크가 늘어날수록 어떤 태스크가 실제 가치를 만드는지 평가하기 어렵습니다.\n\n## 토론 포인트\n- 태스크별 "절약된 시간"을 어떻게 정량화할 것인가?\n- 실패율·응답시간·활용 횟수 중 ROI 대리 지표로 가장 적합한 것은?\n- 저ROI 태스크 자동 비활성화 정책 도입 가능성\n\n## 기대 결론\n태스크 ROI 측정 지표 2-3개 합의 및 tasks.json 필드 설계',
    tags: ['비용', '최적화', '자동화'],
  },
  {
    title: 'SSH 보안 강화 이후 운영 편의성 회복',
    content: '## 배경\n키 인증 전용 + root 차단 이후 일부 자동화 스크립트가 SSH 통해 원격 실행하는 흐름이 막힐 수 있습니다.\n\n## 토론 포인트\n- n8n/Jarvis에서 Mac Mini 원격 명령 실행이 필요한 케이스 목록화\n- jump host 없이 안전한 원격 실행 대안(LocalForward, 전용 서비스 계정)\n- 보안 vs 편의 트레이드오프에서 현재 임계점은 적절한가?\n\n## 기대 결론\n원격 실행이 필요한 케이스별 보안 허용 방안 결정',
    tags: ['SSH', '보안', '인프라'],
  },
];

/** ~/.jarvis/lib/rag-query.mjs를 child_process로 호출해 관련 컨텍스트 반환 */
async function queryRag(query: string, timeoutMs = 8000): Promise<string> {
  const ragQueryPath = join(homedir(), '.jarvis', 'lib', 'rag-query.mjs');
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath, // 현재 Node.js 바이너리
      [ragQueryPath, query],
      { timeout: timeoutMs, env: { ...process.env, BOT_HOME: join(homedir(), '.jarvis') } },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve('');
        } else {
          // 최대 1500자로 잘라 LLM 토큰 낭비 방지
          resolve(stdout.trim().slice(0, 1500));
        }
      }
    );
    // 혹시 timeout 콜백이 늦어도 resolve 보장
    child.on('error', () => resolve(''));
  });
}

async function generateTopic(db: any): Promise<{ title: string; content: string; tags: string[] }> {
  // ── 소스 A: 최근 8개 제목 (중복 방지) ──────────────────────────────────────
  const recent = db.prepare('SELECT title FROM posts ORDER BY created_at DESC LIMIT 8').all() as any[];
  const recentTitles = recent.map((r: any) => `- ${r.title}`).join('\n') || '없음';

  // ── 소스 A+: 최근 2주 resolved 토론 컨텍스트 ────────────────────────────────
  let recentResolvedContext = '';
  try {
    const recentResolved = db.prepare(`
      SELECT title, tags FROM posts
      WHERE status = 'resolved' AND created_at > datetime('now', '-14 days')
      ORDER BY created_at DESC LIMIT 5
    `).all() as any[];
    if (recentResolved.length > 0) {
      recentResolvedContext = recentResolved
        .map((p: any) => `- ${p.title} [${p.tags}]`)
        .join('\n');
    }
  } catch {
    // DB 오류 시 무시
  }

  // ── 소스 B: RAG 쿼리 ────────────────────────────────────────────────────────
  let ragContext = '';
  try {
    ragContext = await queryRag('Jarvis 시스템 자주 겪는 문제 불편사항 개선 요청 버그');
  } catch {
    // RAG 실패 시 빈 문자열로 fallback
  }

  // ── 소스 C: 개선된 프롬프트 조립 ────────────────────────────────────────────
  const resolvedSection = recentResolvedContext
    ? `\n최근 2주간 해결된 토론들 (연속선상 또는 미다룬 이슈 발굴):\n${recentResolvedContext}\n`
    : '';

  const ragSection = ragContext
    ? `\n실제 팀 이슈·불편사항 (RAG 검색 결과, 참고용):\n${ragContext}\n`
    : '';

  const prompt = `당신은 자비스 컴퍼니의 전략기획 시스템입니다.
팀 토론 게시판에 올릴 새로운 토론 주제를 생성하세요.

자비스 컴퍼니: AI 자동화 어시스턴트 개발. 7개 팀(전략·성장·기록·브랜드·학술·인프라·위원회). LLM 크론 자동화, Discord 봇, Obsidian 지식관리.

## 주제 생성 규칙
- 추상적·제너릭 주제 금지: "AI 활용 방안", "팀 협업 개선" 같은 막연한 주제 불가
- 구체적 실무 문제: 실제 시스템(Discord봇/크론/RAG/Obsidian/비용) 관련 결정 필요 이슈
- 30분 내 에이전트들이 구체적 의견을 낼 수 있는 범위
- 실행 가능한 결론으로 이어지는 주제 (설정 변경 / 태스크 추가 / 정책 결정)
- 현재 수치·가격 기반 주제 금지 (주제가 즉시 낡아짐)

## 출력 형식 (JSON만, 코드블록 없이)
{"title":"제목(50자 이내)","content":"## 배경\\n2-3줄\\n\\n## 토론 포인트\\n- 포인트1\\n- 포인트2\\n- 포인트3\\n\\n## 기대 결론\\n1줄","tags":["태그1","태그2"]}

최근 토론 (중복 금지):
${recentTitles}
${resolvedSection}${ragSection}`;

  try {
    const raw = await callLLM(prompt, { model: MODEL_FAST, maxTokens: 400, timeoutMs: 12000 });
    const trimmed = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(trimmed);
    if (parsed.title && parsed.content) return parsed;
  } catch {}

  // LLM 실패 시 fallback pool에서 랜덤 선택
  return FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)];
}

async function tick() {
  try {
    // 동적 import로 순환참조 방지
    const { getDb } = await import('./db');
    const db = getDb();

    // 일시정지 설정 확인
    const pauseSetting = db.prepare(
      "SELECT value FROM board_settings WHERE key = 'auto_post_paused'"
    ).get() as { value: string } | undefined;
    if (pauseSetting?.value === '1') return;

    const now = Date.now();

    // 가장 최근 포스트 확인
    const latest = db.prepare(`
      SELECT status, COALESCE(restarted_at, created_at) as start_time
      FROM posts ORDER BY created_at DESC LIMIT 1
    `).get() as any;

    if (latest) {
      const startStr: string = latest.start_time;
      const ageMs = now - new Date(startStr.includes('Z') ? startStr : startStr + 'Z').getTime();
      const isActive = latest.status === 'open' || latest.status === 'in-progress';

      // 활성 상태이고 아직 30분이 안 됐으면 아무것도 하지 않음
      if (isActive && ageMs < CYCLE_MS) return;
    }

    // 새 토론 생성
    const topic = await generateTopic(db);
    const postId = nanoid();

    db.prepare(`
      INSERT INTO posts (id, title, type, author, author_display, content, status, priority, tags, channel)
      VALUES (?, ?, 'discussion', 'jarvis-proposer', 'Jarvis AI', ?, 'open', 'medium', ?, 'auto')
    `).run(postId, topic.title, topic.content, JSON.stringify(topic.tags ?? []));

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
    broadcastEvent({ type: 'new_post', post_id: postId, data: post });

    console.log(`[auto-poster] 새 토론 생성: "${topic.title}" (${postId})`);
  } catch (e) {
    console.error('[auto-poster] tick 오류:', e);
  }
}

export function ensureAutoPosterRunning() {
  if (global.__autoPoster != null) return;
  global.__autoPoster = setInterval(tick, INTERVAL_MS);
  // 앱 시작 직후 10초 후 첫 실행 (DB/SSE 초기화 대기)
  setTimeout(tick, 10_000);
  console.log('[auto-poster] 스케줄러 시작 (60초 간격)');
}
