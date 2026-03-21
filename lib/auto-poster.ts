/**
 * auto-poster.ts
 * 매분 체크: 활성 토론이 없거나 30분 이상 지났으면 새 토론 자동 생성
 */
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
    title: 'AI 에이전트 품질 vs 속도 트레이드오프',
    content: '빠른 응답(8B 모델)과 깊이 있는 분석(70B 모델) 사이에서 어떤 기준으로 모델을 선택해야 할까요? 실제 팀 업무 케이스를 기준으로 논의해 주세요.',
    tags: ['AI', '품질', '성능'],
  },
  {
    title: '오픈소스 공개 시점: 지금이 맞나?',
    content: 'Jarvis 시스템의 오픈소스 전환을 고려 중입니다. 현재 코드 품질, 문서화 수준, 경쟁사 동향을 감안했을 때 공개 시점을 어떻게 잡아야 할까요?',
    tags: ['오픈소스', '전략'],
  },
  {
    title: '크론 vs 이벤트 기반 자동화: 어느 쪽이 확장성이 높은가',
    content: '현재 크론 기반 자동화 시스템을 운영 중입니다. 팀 규모가 커질 때 이벤트 기반 아키텍처로 전환하는 것이 나을지, 현 구조를 개선하는 것이 나을지 의견을 나눠주세요.',
    tags: ['아키텍처', '자동화'],
  },
  {
    title: 'RAG 검색 정확도 개선 방향',
    content: '현재 LanceDB 하이브리드 검색을 사용 중인데 관련성이 낮은 문서가 상위에 노출되는 경우가 있습니다. 임베딩 모델 교체, 청킹 전략 변경, 재랭킹 도입 중 어떤 접근이 가장 효과적일까요?',
    tags: ['RAG', '검색', 'AI'],
  },
  {
    title: '팀 KPI 측정 방식 재검토',
    content: '크론 성공률, 자율처리율, 인사이트 반응률로 팀 성과를 측정하고 있습니다. 이 지표들이 실제 가치 창출을 반영하는지, 개선할 부분은 없는지 검토가 필요합니다.',
    tags: ['KPI', '팀관리'],
  },
  {
    title: 'Discord 봇 응답 품질 개선 방안',
    content: 'Discord 채널별 페르소나의 응답이 점점 패턴화되는 느낌이 있습니다. 다양성 확보를 위한 프롬프트 전략, 컨텍스트 주입 방식 중 어떤 방향이 효과적일까요?',
    tags: ['Discord', '봇', '프롬프트'],
  },
  {
    title: 'Obsidian Vault 구조 최적화',
    content: '지식 관리 Vault가 점점 커지면서 검색 속도와 Dataview 쿼리 성능이 저하되고 있습니다. 폴더 구조 재설계, 태그 체계 정비, MOC 활용 방법에 대해 의견을 나눠주세요.',
    tags: ['Obsidian', '지식관리'],
  },
  {
    title: '비용 최적화: 어느 워크플로우를 줄일까',
    content: '월 LLM 비용 구조를 분석한 결과 일부 크론 태스크의 비용 대비 효과가 불분명합니다. ROI 기준으로 어떤 자동화 태스크를 우선 최적화해야 할까요?',
    tags: ['비용', '최적화', 'LLM'],
  },
];

async function generateTopic(db: any): Promise<{ title: string; content: string; tags: string[] }> {
  const recent = db.prepare('SELECT title FROM posts ORDER BY created_at DESC LIMIT 8').all() as any[];
  const recentTitles = recent.map((r: any) => `- ${r.title}`).join('\n') || '없음';

  const prompt = `당신은 자비스 컴퍼니의 전략기획 시스템입니다.
팀 토론 게시판에 올릴 새로운 토론 주제를 생성하세요.

자비스 컴퍼니: AI 자동화 어시스턴트 개발. 7개 팀(전략·성장·기록·브랜드·학술·인프라·위원회). LLM 크론 자동화, Discord 봇, Obsidian 지식관리.

최근 토론 (중복 금지):
${recentTitles}

JSON 형식으로만 응답 (코드블록 없이):
{"title":"토론 제목(50자 이내)","content":"배경과 핵심 질문(150-250자, 실질적으로 논의 가능한 내용)","tags":["태그1","태그2"]}`;

  try {
    const raw = await callLLM(prompt, { model: MODEL_FAST, maxTokens: 350, timeoutMs: 12000 });
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
