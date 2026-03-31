/** 카카오페이 실전 질문 풀 — 카테고리별 분류, LLM 프롬프트에 주입됨 */
export const KAKAOPAY_QUESTIONS: Record<string, string[]> = {
  'distributed-tx': [
    '결제 승인 요청이 성공했지만 이후 매입 처리 중 DB 장애가 발생했습니다. 이 시나리오에서 데이터 정합성을 어떻게 보장하시겠습니까?',
    'Saga 패턴에서 Choreography와 Orchestration의 차이를 설명하고, 카카오페이 결제 시스템에 어느 방식이 더 적합한지 근거와 함께 말씀해 주세요.',
    'TCC(Try-Confirm-Cancel) 패턴을 결제 취소 시나리오에 적용한다면 Try/Confirm/Cancel 각 단계에서 무엇을 처리해야 합니까?',
    '분산 트랜잭션에서 2PC(Two-Phase Commit)를 사용하지 않는 이유를 설명하고, 대안으로 선택한 패턴과 그 이유를 실무 경험을 들어 말씀해 주세요.',
    '아웃박스 패턴(Transactional Outbox)이 무엇인지 설명하고, 결제 이벤트 발행에 어떻게 활용하는지 구체적으로 설명해 주세요.',
    '보상 트랜잭션 구현 시 멱등성을 어떻게 보장합니까? 코드 수준의 구체적 구현 방법을 말씀해 주세요.',
    '이벤트 소싱(Event Sourcing)을 결제 시스템에 적용할 때의 장단점과 실제 적용 시 주의사항을 말씀해 주세요.',
  ],
  'payment-arch': [
    '결제 상태 머신(State Machine)을 설계한다면 어떤 상태와 전이(transition)를 정의하시겠습니까? 부분취소는 어떻게 처리합니까?',
    '이중 결제(double payment) 방지를 위한 멱등성 키 설계 방법을 설명해 주세요. Redis와 DB를 어떻게 조합합니까?',
    '결제 대사(reconciliation) 시스템을 설계한다면 어떻게 구현하시겠습니까? 불일치 감지와 자동 복구는 어떻게 처리합니까?',
    'PG사와의 연동에서 타임아웃이 발생했을 때 Unknown 결제 상태를 어떻게 처리합니까? 상태 조회 재시도 전략을 말씀해 주세요.',
    '결제 승인 API의 SLA가 99.99%라면 단일 장애점(SPOF) 없는 고가용성 설계를 어떻게 구성하시겠습니까?',
    '결제 취소와 환불 프로세스에서 카드사/은행과 내부 시스템 간 정합성이 깨지는 경우 어떻게 복구합니까?',
  ],
  'concurrency': [
    '동시에 100개의 결제 요청이 같은 계좌에 들어올 때 잔액 초과 결제를 어떻게 방지합니까? 낙관적 락과 비관적 락 중 무엇을 선택하고 그 이유는?',
    'Redisson watchdog 메커니즘을 설명하고, 결제 처리 중 서버가 갑자기 다운됐을 때 분산락이 어떻게 자동 해제됩니까? 단순 SETNX+TTL 방식과 비교했을 때 Redisson의 장단점을 말씀해 주세요.',
    '낙관적 락(Optimistic Lock)이 연속 충돌로 실패할 때 재시도 전략을 어떻게 구성합니까? 결제 시스템에서 재시도가 안전한 경우와 위험한 경우를 구분해 주세요.',
    '계좌 잔액 확인과 차감이 코어뱅킹 서비스와 결제 서버로 분산되어 있을 때 DB의 SELECT FOR UPDATE가 동작하지 않는 이유를 설명하고, 이 상황에서 잔액 초과 결제를 방지하는 방법을 설명해 주세요.',
  ],
  'kafka': [
    '결제 이벤트를 Kafka로 발행할 때 at-least-once 보장으로 중복 이벤트가 발생했습니다. 컨슈머에서 멱등성을 어떻게 보장합니까?',
    'Kafka 컨슈머 리밸런싱 중 결제 완료 이벤트 처리에 실패했습니다. 오프셋 커밋 전략을 어떻게 설계하시겠습니까?',
    'Kafka를 이용한 Saga 구현에서 보상 이벤트가 순서대로 처리되지 않는 경우 어떻게 처리합니까?',
    '결제 완료 이벤트가 Kafka에 발행됐지만 정산 서비스 컨슈머가 다운된 상태입니다. 데이터 손실 없이 복구하는 과정을 설명해 주세요.',
  ],
  'system-design': [
    '일일 1,000만 건 결제를 처리하는 시스템을 설계해 주세요. DB 병목 지점과 해결 방안을 포함해 주세요.',
    'Circuit Breaker 패턴을 카드사 연동 API에 적용할 때 Open/Half-Open/Closed 상태 전환 기준을 어떻게 설정합니까?',
    '결제 서버 무중단 배포 중 진행 중인 트랜잭션이 있을 때 어떻게 처리합니까? Graceful Shutdown 구현 방법을 설명해 주세요.',
    '외부 PG사 API 응답이 불규칙할 때 Bulkhead 패턴으로 장애 격리를 어떻게 구현합니까? 스레드 풀 기반 격리와 세마포어 기반 격리의 차이를 결제 시스템 관점에서 설명해 주세요.',
    'CQRS 패턴을 결제 조회 서비스에 도입할 때 커맨드 DB와 조회 DB 간 일관성을 어떻게 보장합니까? 결제 완료 직후 내역 조회에서 데이터가 보이지 않는 문제를 어떻게 처리합니까?',
  ],
  'mysql-tuning': [
    '결제 이력 테이블(월 1억 건)에서 특정 userId의 최근 3개월 결제 내역 조회에 EXPLAIN을 실행했더니 type=ALL(풀 스캔)이 나왔습니다. 인덱스 전략을 어떻게 설계하겠습니까?',
    '커버링 인덱스(Covering Index)가 무엇인지 설명하고, `SELECT amount, status FROM payments WHERE user_id=? AND created_at>?` 쿼리에 적용하는 방법과 성능 개선 원리를 설명해 주세요.',
    '결제 이력 테이블이 5억 건을 초과할 때 파티셔닝 전략을 어떻게 결정합니까? Range 파티셔닝과 Hash 파티셔닝의 장단점을 결제 도메인 관점에서 비교하고, 파티션 프루닝(Pruning)이 적용되는 조건을 설명해 주세요.',
    '운영 중인 결제 테이블에 인덱스를 무중단으로 추가해야 합니다. Online DDL과 pt-online-schema-change(pt-osc)의 차이를 설명하고, 어떤 상황에서 무엇을 선택합니까?',
    '결제 승인 내역 조회 API에서 JPA N+1 문제가 발생했습니다. fetch join, EntityGraph, @BatchSize의 동작 방식과 적합한 사용 시나리오를 비교하고, 결제 조회에서 최적 선택을 설명해 주세요.',
    'MySQL Read Replica를 결제 조회 서비스에 도입할 때 복제 지연(Replication Lag)이 결제 직후 내역 조회 정합성에 미치는 영향과, 복제를 활용하면서도 정합성을 보장하는 전략을 설명해 주세요.',
  ],
  'java-spring': [
    'G1GC와 ZGC의 STW(Stop-The-World) 방식 차이를 설명하고, 결제 API처럼 p99 레이턴시가 중요한 서비스에 어느 GC가 적합한지 근거를 들어 설명해 주세요.',
    'Spring WebFlux(Reactor)로 결제 API를 구현할 때 JDBC 같은 블로킹 코드가 혼재하면 어떤 문제가 발생합니까? subscribeOn/publishOn을 이용한 Scheduler 분리 전략을 설명해 주세요.',
    'Spring AOP self-invocation 문제를 설명하고, 같은 클래스 내부에서 @Transactional 메서드를 호출할 때 트랜잭션이 적용되지 않는 이유와 해결 방법을 설명해 주세요.',
    'JDK 21 Virtual Thread를 결제 서버에 도입할 때 HikariCP 커넥션 풀 고갈 문제가 발생하는 이유를 설명하고, 풀 크기 산정과 pinning 방지 방법을 말씀해 주세요.',
    'Spring Batch로 월 정산 배치(수천만 건)를 구현할 때 Chunk 크기, 멀티스레드 Step, 파티셔닝 Step의 차이를 설명하고, 정산 도중 일부 실패 시 skip/retry/restart 전략을 어떻게 설계합니까?',
    '내부 마이크로서비스 간 통신에 gRPC와 REST 중 무엇을 선택하겠습니까? 결제 서버와 코어뱅킹 서비스 간 통신을 예로 들어 Protobuf 직렬화, 스트리밍, 서킷 브레이커 통합을 설명해 주세요.',
  ],
  'cs-basics': [
    'TCP TIME_WAIT 상태가 결제 서버에서 대량 단기 연결 시 포트 고갈 문제를 어떻게 유발합니까? SO_REUSEADDR, tcp_tw_reuse 설정과 커넥션 풀 사용이 각각 어떻게 완화합니까?',
    'B-Tree 인덱스와 Hash 인덱스의 내부 구조와 탐색 복잡도를 비교하고, `WHERE created_at BETWEEN ? AND ?` 범위 검색과 `WHERE payment_id = ?` 단일 검색에 각각 어떤 인덱스가 더 적합한지 설명해 주세요.',
    '프로세스, OS 스레드, JVM 스레드, Virtual Thread(JDK 21)의 컨텍스트 스위칭 비용과 메모리 오버헤드를 비교하고, 결제 서버의 동시 요청 처리 모델 선택에 어떻게 반영합니까?',
    'HTTP/1.1 Keep-Alive와 HTTP/2 멀티플렉싱이 결제 API 클라이언트 성능에 어떻게 다르게 작용합니까? PG사 연동 시 HTTPS 커넥션 재사용이 결제 지연 시간에 미치는 영향을 설명해 주세요.',
    'MySQL REPEATABLE READ에서 결제 잔액 조회 시 팬텀 리드(Phantom Read)가 발생하는 구체적 시나리오를 설명하고, InnoDB Gap Lock이 이를 어떻게 방지하는지 설명해 주세요.',
    '결제 서버에서 OOM(OutOfMemoryError) 발생 시 원인 분석 방법을 단계별로 설명해 주세요. Heap Dump 분석, GC 로그 해석, 메모리 릭 패턴(Static 컬렉션, 캐시 미해제, 이벤트 리스너 누수) 진단 방법은?',
  ],
  'behavioral': [
    '팀 내에서 기술적 방향성 차이로 동료와 충돌한 경험이 있다면 STAR 방식으로 말씀해 주세요. 어떤 결론이 났고, 의견을 어떻게 관철하거나 양보했습니까?',
    'SK D&D에서 기술 부채가 쌓여 있지만 해결을 미룬 것이 있다면 무엇이고, 우선순위를 어떻게 판단했습니까? 비즈니스 요구사항과 기술 부채 해소 사이의 균형을 어떻게 맞췄습니까?',
    '지금까지 경력에서 가장 심각한 장애를 대응한 경험을 STAR 방식으로 말씀해 주세요. 그 장애 이후 아키텍처나 운영 방식에서 무엇을 구조적으로 바꾸었습니까?',
    '새로운 기술 도입을 제안했지만 팀이나 조직의 반대에 부딪힌 경험이 있습니까? 어떻게 설득하려 했고 결과는 어땠습니까? 반대 의견에서 납득할 근거가 있었다면 어떻게 의견을 수정했습니까?',
    '9년 경력에서 가장 잘못된 기술적 판단을 하나 꼽는다면 무엇입니까? 당시 왜 그 판단을 내렸고, 지금이라면 어떻게 다르게 결정하겠습니까? 그 경험이 현재 의사결정에 어떤 영향을 미쳤습니까?',
  ],
};

export const COMPANIES = [
  { id: 'kakaopay', name: '카카오페이', emoji: '💳', desc: '결제 서버 개발자 — 분산 트랜잭션·정합성 집착', style: 'border-yellow-300 bg-yellow-50', highlight: true },
  { id: 'kakao', name: '카카오', emoji: '🟡', desc: '알고리즘·CS 기초·코드 품질 날카로운 반박', style: 'border-yellow-200 bg-yellow-50', highlight: false },
  { id: 'naver', name: '네이버', emoji: '🟢', desc: '기술 깊이·실무 경험 집요하게 파고듦', style: 'border-green-200 bg-green-50', highlight: false },
  { id: 'toss', name: '토스', emoji: '💙', desc: '시스템 디자인·장애 대응·숫자로 증명', style: 'border-blue-200 bg-blue-50', highlight: false },
  { id: 'line', name: '라인', emoji: '🟩', desc: '글로벌 스케일·안정성·대규모 트래픽', style: 'border-emerald-200 bg-emerald-50', highlight: false },
  { id: 'coupang', name: '쿠팡', emoji: '🔴', desc: '실용주의·성과 중심·수치 증명 요구', style: 'border-red-200 bg-red-50', highlight: false },
  { id: 'sk', name: 'SK D&D', emoji: '⚪', desc: '현 직장 레거시 탈출 스토리·IoT 플랫폼', style: 'border-zinc-200 bg-zinc-50', highlight: false },
] as const;

/** 카테고리별 필수 키워드 — LLM이 답변에서 누락된 키워드를 감지하는 데 사용 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'distributed-tx': ['Saga', 'TCC', '2PC', '보상 트랜잭션', '이벤트 소싱', '아웃박스', 'CQRS', '멱등성'],
  'concurrency': ['낙관적 락', '비관적 락', 'Redis 분산락', '데드락', 'CAS', '원자적 연산', 'Redisson', 'watchdog'],
  'payment-arch': ['승인', '취소', '매입', '대사', '정산', '멱등성', '이중 결제 방지', '결제 상태 머신'],
  'mysql-tuning': ['인덱스', '실행 계획', 'EXPLAIN', '커버링 인덱스', '파티셔닝', '쿼리 최적화', 'N+1', 'Read Replica', 'Online DDL'],
  'kafka': ['파티션', '컨슈머 그룹', '오프셋', 'at-least-once', 'exactly-once', '리밸런싱', '배압'],
  'java-spring': ['JVM', 'GC', 'WebFlux', 'Reactor', 'IoC', 'AOP', 'gRPC', 'Protobuf', 'Virtual Thread', 'Spring Batch'],
  'cs-basics': ['프로세스', '스레드', 'TCP', 'HTTP', 'ACID', '정규화', 'B-Tree', 'TIME_WAIT', 'Gap Lock'],
  'system-design': ['로드 밸런서', 'Circuit Breaker', 'Auto Scaling', 'CDN', 'API Gateway', 'CAP 정리', 'CQRS', 'Bulkhead'],
  'behavioral': ['STAR', '갈등', '기술 부채', '회고', '의사결정'],
  'live-coding': ['시간복잡도', 'O(n)', '엣지 케이스', '테스트 케이스'],
};

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
- 기술 스택: Java 17, Spring Boot, Spring WebFlux, gRPC, AWS (EC2/ECS/RDS/SQS/SNS/Lambda), Kafka, Redis
- 특이사항: 카카오페이 서버 개발자 - 결제 서비스 서류 전형 합격 상태

[지원자 실제 경험 — 면접 평가 기준으로 활용]
지원자는 아래 경험들을 보유합니다. 답변에서 이 경험을 언급하면 높이 평가하고,
이 경험이 있음에도 추상적·이론적 답변만 하면 "실제 경험을 구체적으로 말씀해 주세요"로 파고드세요.

【STAR-1】Spring Batch 20배 성능 개선 (JANDI/토스랩)
- 상황: 5000만 건 데이터 처리 배치가 3시간 12분 초과, Jenkins 타임아웃 반복 발생
- 분석: StepExecutionListener로 각 단계 시간 계측 → 특정 Step에서 95% 시간 소비 발견
- 해결: ExecutorService로 5개 Step 병렬화, Chunk 크기 최적화
- 결과: 3시간 12분 → 9분 20초 (20배 개선). 이론상 예상(42분)보다 훨씬 빠른 결과

【STAR-2】Virtual Thread + HikariCP 커넥션풀 고갈 (SK D&D)
- 상황: 개발 서버 완전 먹통, ALB 헬스체크 무응답, 로그 한 줄도 없음
- 원인: Virtual Thread 100개 병렬 DB 조회 + HikariCP 개발환경 풀 크기 10개 → Deadlock
- 해결: 커넥션풀 10 → 50으로 증가, 병렬 조회 수 10개로 제한, 타임아웃 설정
- 결과: Starvation 해소, 운영 환경 사전 가이드라인 수립

【STAR-3】IoT 다중벤더 Adapter 패턴 (SK D&D)
- 상황: 제조사마다 다른 API(REST/MQTT, 인증방식, 응답형식) → if-else 100줄 지옥, 신규 제조사 추가 2주 소요
- 해결: 공통 IotDeviceAdapter 인터페이스 + 제조사별 구현체 + Event-Driven으로 결합도 제거
- 결과: 신규 제조사 온보딩 2주 → 2일, 비즈니스 로직이 제조사 API에서 완전 독립

【STAR-4】스케줄러 데드락 해결 (SK D&D)
- 상황: 10분마다 실행 스케줄러 간헐적 데드락 (시간당 3회), 재현 불가, 운영 DB Lock 경합
- 원인: 20만 건 전체 조회로 20초간 Lock 유지 → API 서버와 Lock 경합
- 해결: 조회 범위 90% 축소(20만→2만 건) + REQUIRES_NEW 트랜잭션 분리 + 500건 Chunking
- 결과: 데드락 주 3-4회 → 0회, Lock 유지 20초 → 1ms (99.9% 감소)

【STAR-5】SQS DLQ 멱등성 설계 (SK D&D)
- 상황: 예약 메시지 발송 간헐적 실패, 3일간 모니터링 부재로 DLQ 150건 적체
- 원인: 가시성 타임아웃(30s) < 처리 시간(45s) → 메시지 중복 수신 후 중복 발송
- 해결: 가시성 타임아웃 90s로 조정 + 멱등성 키 기반 중복 처리 방지 + CloudWatch DLQ 알림
- 결과: 발송 실패율 3% → 0%, MTTD 3일 → 5분
`.trim();

/** 답변 평가 전용 프롬프트 — 질문 생성 규칙 없이 JSON 평가에만 집중 */
export function getFeedbackSystemPrompt(companyId: string, categoryId: string, difficulty: string, conversationHistory?: string): string {
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
  const keywords = CATEGORY_KEYWORDS[categoryId] ?? [];
  const keywordsLine = keywords.length > 0
    ? `\n- 이 카테고리의 핵심 키워드 목록: [${keywords.join(', ')}]\n  → 지원자가 답변에서 언급하지 않은 키워드를 missing_keywords 배열에 포함하세요.`
    : '';

  // 카카오페이 전용 평가 기준 추가
  const kakaoPayEvalCriteria = companyId === 'kakaopay' ? `

[카카오페이 전용 평가 기준 — 최우선 적용]
1. 금전 정합성: 답변이 금전 손실 가능성을 인지하고 방어하는지 (배점 가중 +10점)
2. 멱등성 설계: 중복 요청/재시도 상황을 구체적으로 다루는지
3. 장애 시나리오 대응: "X가 실패하면?" 질문에 구체적 복구 플랜이 있는지
4. 결제 도메인 용어: 승인/매입/취소/대사/정산 용어를 정확히 사용하는지
5. 실무 경험: 추상적 이론이 아닌 실제 구현 경험을 바탕으로 답하는지

[꼬리질문 3단계 압박 규칙 — 카카오페이]
- 1단계 (기본): 개념 설명 요청
- 2단계 (구현): "실제 코드에서 어떻게 구현하셨나요?" / "구체적인 흐름을 단계별로 설명해 주세요."
- 3단계 (장애): "그 방식에서 네트워크 파티션이 발생하면 어떻게 됩니까?" / "결제가 중간에 끊기면 상태는?"
- 4단계 (극한): "그 복구 과정에서 또 장애가 나면 어떻게 됩니까? 무한 루프를 어떻게 방지합니까?"
→ next_question은 반드시 현재 답변보다 한 단계 더 깊은 레벨의 압박 질문이어야 합니다.` : '';

  const historyBlock = conversationHistory
    ? `\n\n[이전 대화 맥락 — 일관성 검증 필수]\n${conversationHistory}\n→ 지원자의 현재 답변이 위 이전 답변들과 논리적으로 모순되는 부분이 있으면 "contradiction" 필드에 구체적으로 기술하세요. 모순 없으면 null.`
    : '';

  return `당신은 ${company} 면접관으로서 지원자의 기술 면접 답변을 평가합니다.

[평가 맥락]
- 카테고리: ${category}
- 난이도 기준: ${difficultyLabel}
- 지원자: 9년차 Java/Spring 백엔드 개발자 (AWS, Kafka, Redis, gRPC 경험)${keywordsLine}

[지원자 실제 보유 경험 — 평가 기준으로 활용]
지원자가 아래 경험과 연결해 구체적으로 답변하면 강점으로 인정하세요.
반대로 이 경험이 있음에도 추상적 이론만 답하면 weaknesses에 "실제 경험 연결 부족" 명시.

① Spring Batch 20배 개선: 5000만건 배치 3시간 12분 → 9분 20초 (StepExecutionListener 계측 → ExecutorService 병렬화)
② Virtual Thread 서버 다운: HikariCP 풀 10개 고갈 → 커넥션 Deadlock → ALB 504 (JDK21 Virtual Thread 환경)
③ IoT 다중벤더 Adapter 패턴: if-else 100줄 → 공통 인터페이스 추상화 → 제조사 추가 2주 → 2일
④ 스케줄러 데드락: 20만건 Full Scan Lock 20초 → REQUIRES_NEW 분리 + 500건 Chunking → Lock 1ms
⑤ SQS DLQ 멱등성: 가시성 타임아웃 < 처리시간 → 중복 수신 → 멱등성 키 + DLQ 알림 (3% → 0%)${kakaoPayEvalCriteria}

[평가 기준]
- 기술 정확도, 실무 경험 연결, 구체성, 깊이를 종합 평가
- 답변이 불충분하거나 "모른다"는 경우도 정직하게 낮은 점수를 부여하고 weaknesses와 better_answer를 반드시 제공

[응답 형식 — 반드시 아래 JSON만 출력]
{
  "score": 50,
  "strengths": ["잘한 점을 구체적으로"],
  "weaknesses": ["부족한 점을 구체적으로"],
  "better_answer": "면접관 앞에서 실제로 말하듯 자연스러운 구어체 한국어로 작성한 모범 예시 답변 (3~5문장 산문. 불릿·번호 목록 금지)",
  "missing_keywords": ["언급 안 한 핵심 키워드1", "키워드2"],
  "next_question": "점수가 70 미만이면 weaknesses[0]를 집중 공략하는 압박 후속 질문(예: '방금 [약점]을 언급하셨는데 구체적으로 어떻게 해결하셨나요?'). 70 이상이면 연관 심화 주제 확장 질문. senior 난이도는 항상 압박 스타일.",
  "contradiction": "이전 Q1에서 Saga Choreography를 선택했는데 이번 답변에서 Orchestration이 더 낫다고 했습니다" 또는 null
}

[꼬리질문 생성 규칙]
- 점수 < 70: weaknesses의 첫 번째 항목을 집중 공략하는 압박 꼬리질문. '방금 말씀하신 [약점]에 대해 더 구체적으로 설명해 주시겠어요?' 스타일로 생성.
- 점수 >= 70: 답변에서 언급된 개념과 연관된 더 깊은 주제로 확장하는 심화 질문.
- 난이도가 senior이면: 점수와 무관하게 항상 압박 스타일의 꼬리질문을 생성하세요.
${historyBlock}

JSON 외 다른 텍스트는 절대 출력하지 마세요.

[언어 규칙 — 절대 준수]
모든 JSON 값(strengths·weaknesses·better_answer·next_question 등)은 반드시 순수 한국어로만 작성합니다.
한자(漢字)·중국어·일본어를 한국어 문장 안에 절대 혼용하지 마세요. 예: "请求" → "요청", "処理" → "처리".`;
}

// 회사별 합격 기준 점수 및 메시지
export const COMPANY_PASS_CRITERIA: Record<string, {
  passScore: number;
  description: string;
  tips: string[];
}> = {
  kakaopay: {
    passScore: 75,
    description: '카카오페이는 결제 정합성과 분산 트랜잭션 이해도를 최우선으로 평가합니다.',
    tips: ['Saga/TCC 패턴 완벽 숙지', '멱등성 처리 실무 경험 강조', '장애 시 데이터 정합성 보장 방법'],
  },
  kakao: {
    passScore: 78,
    description: '카카오는 CS 기초와 코드 품질, 알고리즘적 사고를 중시합니다.',
    tips: ['자료구조/알고리즘 기초 탄탄히', '코드 리뷰 경험과 품질 기준 정리', '기술 부채 해결 경험'],
  },
  naver: {
    passScore: 72,
    description: '네이버는 실무 경험의 깊이와 구체적 수치를 증명 요구합니다.',
    tips: ['모든 답변에 구체적 수치 포함', '장애 대응 경험 STAR 방식으로 정리', '대용량 트래픽 처리 경험'],
  },
  toss: {
    passScore: 80,
    description: '토스는 시스템 디자인과 장애 대응 능력, 숫자로 증명하는 문화입니다.',
    tips: ['시스템 설계 시 병목 지점 먼저 언급', '모든 결정에 데이터 근거 제시', 'Circuit Breaker/장애 격리 패턴'],
  },
  line: {
    passScore: 75,
    description: '라인은 글로벌 스케일 트래픽과 다국어/다지역 서비스 안정성을 봅니다.',
    tips: ['글로벌 분산 서비스 경험', '다중 리전 데이터 동기화', 'SLA/SLO 기반 설계'],
  },
  coupang: {
    passScore: 73,
    description: '쿠팡은 실용주의와 빠른 실행, 비용 효율성을 중시합니다.',
    tips: ['ROI 중심 기술 선택 근거 준비', '실행 속도와 품질 균형 경험', '대규모 주문/재고 처리 아키텍처'],
  },
  sk: {
    passScore: 68,
    description: 'SK D&D는 IoT 플랫폼과 계약/정산 자동화 실무 경험을 중시합니다.',
    tips: ['레거시 시스템 개선 경험', 'IoT 데이터 처리 파이프라인', '계약/정산 도메인 이해'],
  },
};

export function getSystemPrompt(companyId: string, categoryId: string, difficulty: string, focusKeywords?: string[]): string {
  // 카카오페이 전용: 카테고리별 질문 풀 주입
  const kakaoPayQuestions = KAKAOPAY_QUESTIONS[categoryId] ?? KAKAOPAY_QUESTIONS['distributed-tx'];
  const questionPool = kakaoPayQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n');

  const companyPersonas: Record<string, string> = {
    kakaopay: `당신은 카카오페이 결제 플랫폼팀 시니어 백엔드 엔지니어 면접관입니다.
카카오페이는 결제 승인, 취소, 매입, 정산, 대사 시스템을 운영하며 데이터 정합성이 무너지면 실제 금전 손실이 발생합니다.

[면접 스타일 — 반드시 준수]
- 구체적 장애 시나리오 기반 질문 (이론 질문 최소화)
- 3~4단계 연속 꼬리 질문 압박: 기본 개념 → 구현 세부사항 → 장애 시나리오 → 복구 과정
- 답변이 추상적이면: "실제로 구현하셨다면 코드에서 어떤 부분이 핵심이었나요?" 파고들기
- 금전 정합성 관련 답변에는 반드시 꼬리 질문 연계
- 좋은 답변에도 "그런데 그 방식에서 X 상황이 발생하면 어떻게 됩니까?" 압박 유지

[이 카테고리 추천 질문 풀 — 아래 중 선택하거나 변형해서 사용]
${questionPool}`,
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

  const focusBlock = focusKeywords && focusKeywords.length > 0
    ? `\n\n[이번 세션 집중 공략 키워드 — 최우선 출제]\n지원자가 이전 세션에서 언급하지 못한 핵심 키워드: [${focusKeywords.join(', ')}]\n→ 반드시 이 키워드들이 필요한 시나리오 기반 질문을 첫 2~3문제에 우선 출제하세요.`
    : '';

  return `${persona}

${CANDIDATE_PROFILE}

[면접 카테고리]: ${categoryHint}
[난이도]: ${difficultyNote}

[질문 생성 규칙]
- 첫 번째 메시지에서는 질문만 하세요 (인사 없이 바로 질문).
- 질문은 구체적이고 시나리오 기반이어야 합니다.
- 지원자의 SK D&D IoT 플랫폼 경험과 연결지어 질문할 수 있습니다.${focusBlock}

[언어 규칙 — 절대 준수]
- 모든 출력은 반드시 순수 한국어로만 작성합니다.
- 한자(漢字)·중국어·일본어를 한국어 문장 안에 절대 혼용하지 마세요.
- 영어 기술 용어(HTTP, gRPC, Kafka 등 고유명사 제외)도 한국어로 풀어 쓰세요.
- 예: "请求" 금지 → "요청", "処理" 금지 → "처리"`;
}

