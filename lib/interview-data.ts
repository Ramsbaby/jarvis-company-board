export const COMPANIES = [
  { id: 'kakaopay', name: '카카오페이', emoji: '💳', desc: '결제 서버 개발자 — 분산 트랜잭션·정합성 집착', style: 'border-yellow-300 bg-yellow-50', highlight: true },
  { id: 'kakao', name: '카카오', emoji: '🟡', desc: '알고리즘·CS 기초·코드 품질 날카로운 반박', style: 'border-yellow-200 bg-yellow-50', highlight: false },
  { id: 'naver', name: '네이버', emoji: '🟢', desc: '기술 깊이·실무 경험 집요하게 파고듦', style: 'border-green-200 bg-green-50', highlight: false },
  { id: 'toss', name: '토스', emoji: '💙', desc: '시스템 디자인·장애 대응·숫자로 증명', style: 'border-blue-200 bg-blue-50', highlight: false },
  { id: 'line', name: '라인', emoji: '🟩', desc: '글로벌 스케일·안정성·대규모 트래픽', style: 'border-emerald-200 bg-emerald-50', highlight: false },
  { id: 'coupang', name: '쿠팡', emoji: '🔴', desc: '실용주의·성과 중심·수치 증명 요구', style: 'border-red-200 bg-red-50', highlight: false },
  { id: 'sk', name: 'SK D&D', emoji: '⚪', desc: '현 직장 레거시 탈출 스토리·IoT 플랫폼', style: 'border-zinc-200 bg-zinc-50', highlight: false },
] as const;

export const CATEGORIES = [
  { id: 'distributed-tx', name: '분산 트랜잭션', emoji: '🔄', desc: 'Saga, TCC, 2PC, 보상 트랜잭션', priority: 1 },
  { id: 'concurrency', name: '동시성 제어', emoji: '🔒', desc: '낙관적/비관적 락, Redis 분산락', priority: 1 },
  { id: 'payment-arch', name: '결제 시스템 설계', emoji: '💳', desc: '승인/취소/매입/대사/정산 흐름', priority: 1 },
  { id: 'mysql-tuning', name: 'MySQL 대용량 처리', emoji: '🗄️', desc: '인덱스 전략, 쿼리 최적화, 파티셔닝', priority: 2 },
  { id: 'kafka', name: 'Kafka 비동기', emoji: '📨', desc: '파티션, 컨슈머 그룹, 메시지 보장', priority: 2 },
  { id: 'java-spring', name: 'Java/Spring 심화', emoji: '☕', desc: 'JVM·GC, WebFlux, IoC/AOP, gRPC', priority: 2 },
  { id: 'cs-basics', name: 'CS 기초', emoji: '📚', desc: 'OS·네트워크·DB ACID·자료구조', priority: 3 },
  { id: 'system-design', name: '시스템 디자인', emoji: '🏗️', desc: 'MSA, 대용량 아키텍처, 고가용성', priority: 3 },
  { id: 'behavioral', name: '행동 면접 (STAR)', emoji: '🧠', desc: '갈등·기술부채·성장 스토리', priority: 3 },
  { id: 'live-coding', name: '라이브 코딩', emoji: '💻', desc: 'Java 알고리즘 구현 (1차 대비)', priority: 1 },
] as const;

export const DIFFICULTIES = [
  { id: 'junior', name: '주니어', desc: '3~5년차 수준', emoji: '🌱' },
  { id: 'mid', name: '미드', desc: '5~7년차 수준 (기본값)', emoji: '🌿' },
  { id: 'senior', name: '시니어', desc: '9년차+ 압박 면접', emoji: '🌳' },
] as const;

const CANDIDATE_PROFILE = `
[지원자 이력]
- 이름: 이정우
- 경력: 9년+ 백엔드 개발자
- 현직: SK D&D — IoT 플랫폼 개발, 계약·정산 자동화 시스템
- 기술 스택: Java 17, Spring Boot, Spring WebFlux, gRPC, AWS (EC2/ECS/RDS), Kafka, Redis
- 특이사항: 카카오페이 서버 개발자 - 결제 서비스 서류 전형 합격 상태
`.trim();

/** 답변 평가 전용 프롬프트 — 질문 생성 규칙 없이 JSON 평가에만 집중 */
export function getFeedbackSystemPrompt(companyId: string, categoryId: string, difficulty: string): string {
  const companyNames: Record<string, string> = {
    kakaopay: '카카오페이 결제 플랫폼팀', kakao: '카카오', naver: '네이버',
    toss: '토스', line: '라인', coupang: '쿠팡', sk: 'SK D&D',
  };
  const categoryHints: Record<string, string> = {
    'distributed-tx': '분산 트랜잭션 (Saga, TCC, 2PC)', 'concurrency': '동시성 제어',
    'payment-arch': '결제 시스템 아키텍처', 'mysql-tuning': 'MySQL 대용량 처리',
    'kafka': 'Kafka 비동기', 'java-spring': 'Java/Spring 심화',
    'cs-basics': 'CS 기초', 'system-design': '시스템 디자인',
    'behavioral': '행동 면접', 'live-coding': '라이브 코딩',
  };
  const difficultyLabel = { junior: '주니어(3~5년)', mid: '미드(5~7년)', senior: '시니어(9년+)' }[difficulty] ?? 'mid';
  const company = companyNames[companyId] ?? '테크 기업';
  const category = categoryHints[categoryId] ?? '기술 면접';

  return `당신은 ${company} 면접관으로서 지원자의 기술 면접 답변을 평가합니다.

[평가 맥락]
- 카테고리: ${category}
- 난이도 기준: ${difficultyLabel}
- 지원자: 9년차 Java/Spring 백엔드 개발자 (AWS, Kafka, Redis, gRPC 경험)

[평가 기준]
- 기술 정확도, 실무 경험 연결, 구체성, 깊이를 종합 평가
- 답변이 불충분하거나 "모른다"는 경우도 정직하게 낮은 점수를 부여하고 weaknesses와 better_answer를 반드시 제공

[응답 형식 — 반드시 아래 JSON만 출력]
{
  "score": 50,
  "strengths": ["잘한 점을 구체적으로"],
  "weaknesses": ["부족한 점을 구체적으로"],
  "better_answer": "이렇게 답했으면 더 좋았을 구체적인 예시 답변 (3~5문장)",
  "next_question": "이 답변에 대한 꼬리 질문 또는 새로운 관련 질문"
}

JSON 외 다른 텍스트는 절대 출력하지 마세요.`;
}

export function getSystemPrompt(companyId: string, categoryId: string, difficulty: string): string {
  const companyPersonas: Record<string, string> = {
    kakaopay: `당신은 카카오페이 결제 플랫폼팀 시니어 백엔드 엔지니어 면접관입니다.
카카오페이는 결제 승인, 취소, 매입, 정산, 대사 시스템을 운영하며 데이터 정합성이 무너지면 실제 금전 손실이 발생합니다.
면접 스타일: 구체적 장애 시나리오 기반 질문, 심화 꼬리 질문 연계, 결제 도메인 용어를 자연스럽게 사용.
꼬리 질문은 답변의 약점을 파고드세요.`,
    kakao: `당신은 카카오 서버 개발자 면접관입니다. 알고리즘, CS 기초, 코드 품질을 중시합니다. 날카로운 반박 스타일.`,
    naver: `당신은 네이버 서버 개발자 면접관입니다. 기술 깊이와 실무 경험을 집중 검증합니다. "실제로 해보셨나요?" 증거 요구.`,
    toss: `당신은 토스 백엔드 엔지니어 면접관입니다. 시스템 디자인과 장애 대응 능력을 최우선으로 봅니다. 숫자와 지표 증명 요구.`,
    line: `당신은 라인 글로벌 인프라 팀 면접관입니다. 글로벌 스케일의 안정성과 대규모 트래픽 처리를 중시합니다.`,
    coupang: `당신은 쿠팡 백엔드 엔지니어 면접관입니다. 실용주의적 성과 중심, 빠른 실행력을 봅니다.`,
    sk: `당신은 SK D&D 시니어 아키텍트 면접관입니다. IoT 플랫폼과 레거시 시스템 현대화 경험을 검증합니다.`,
  };

  const categoryHints: Record<string, string> = {
    'distributed-tx': '분산 트랜잭션, Saga 패턴, TCC, 2PC, 보상 트랜잭션, 이벤트 소싱 관련 질문',
    'concurrency': '동시성 제어, 낙관적/비관적 락, Redis 분산락, 데드락 방지 관련 질문',
    'payment-arch': '결제 시스템 아키텍처, 승인/취소/매입/대사/정산 플로우 관련 질문',
    'mysql-tuning': 'MySQL 인덱스 전략, 쿼리 최적화, 실행계획, 파티셔닝 관련 질문',
    'kafka': 'Kafka 파티션, 컨슈머 그룹, 메시지 보장, 오프셋 관련 질문',
    'java-spring': 'Java JVM/GC, Spring IoC/AOP, WebFlux/Reactor, gRPC/Protobuf 관련 질문',
    'cs-basics': 'OS 프로세스/스레드, 네트워크 TCP/HTTP, DB ACID, 자료구조/알고리즘 관련 질문',
    'system-design': 'MSA 아키텍처, 고가용성 설계, 대용량 처리, Circuit Breaker 관련 질문',
    'behavioral': 'STAR 방식 행동 면접, 갈등 해결, 기술 부채 경험, 성장 스토리 관련 질문',
    'live-coding': 'Java 알고리즘 구현 문제 (실제 코드를 텍스트로 작성 요청)',
  };

  const difficultyNote = difficulty === 'senior'
    ? '지원자는 9년차 시니어이므로 압박 면접 수준으로 진행하세요. 모든 답변에 꼬리 질문으로 심화하세요.'
    : difficulty === 'junior'
    ? '기초적인 수준의 질문으로 시작하되 점차 심화하세요.'
    : '미드 레벨 수준의 질문으로, 적절한 깊이를 유지하세요.';

  const persona = companyPersonas[companyId] ?? companyPersonas['kakao'];
  const categoryHint = categoryHints[categoryId] ?? '기술 면접 질문';

  return `${persona}

${CANDIDATE_PROFILE}

[면접 카테고리]: ${categoryHint}
[난이도]: ${difficultyNote}

[피드백 규칙]
지원자가 답변을 제출하면 반드시 다음 JSON 형식으로만 응답하세요:
{
  "score": <0-100 정수>,
  "strengths": ["잘한 점 1", "잘한 점 2"],
  "weaknesses": ["부족한 점 1", "부족한 점 2"],
  "better_answer": "더 좋은 답변 예시 (구체적이고 수치/사례 포함, 3-5문장)",
  "next_question": "다음 꼬리 질문 또는 새 질문"
}

[질문 생성 규칙]
- 첫 번째 메시지에서는 질문만 하세요 (인사 없이 바로 질문).
- 질문은 구체적이고 시나리오 기반이어야 합니다.
- 지원자의 SK D&D IoT 플랫폼 경험과 연결지어 질문할 수 있습니다.`;
}
