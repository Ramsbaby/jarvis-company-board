---
paths:
  - "app/api/**/*.ts"
  - "app/api/**/*.tsx"
---

# API Routes 규칙

## runtime 선언 (파일 최상단 필수)

```ts
export const runtime = 'nodejs';
```

모든 API route 파일의 첫 줄. 누락 시 Edge runtime으로 오동작 가능.

---

## 인증 패턴

### Owner + Guest 체크 (읽기/공개 작업)

```ts
import { getRequestAuth } from '@/lib/guest-guard';

const { isOwner, isGuest } = getRequestAuth(req);
if (!isOwner && !isGuest) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Owner 전용 (관리 작업)

```ts
const { isOwner } = getRequestAuth(req);
if (!isOwner) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Agent 키 체크 (봇/자동화 작업)

```ts
const isAgent = req.headers.get('x-agent-key') === process.env.AGENT_API_KEY;
if (!isOwner && !isAgent) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

- `getRequestAuth(req)` → `{ isOwner, isGuest, isAnon }` 반환 (`@/lib/guest-guard`)
- Agent는 `x-agent-key` 헤더, Owner는 `SESSION_COOKIE` HMAC 토큰으로 판별
- 인증 실패 응답은 반드시 `{ error: '...' }` 형식 + status 401

---

## 응답 형식

```ts
// 성공
return NextResponse.json({ ok: true, data: result });
return NextResponse.json(rows);  // 배열도 OK

// 에러 (항상 { error: 'message' } + status code)
return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
return NextResponse.json({ error: 'Not found' }, { status: 404 });
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
```

- 에러 키는 반드시 `error` (클라이언트 `apiFetch<T>`가 `body.error`를 파싱함)
- 성공 키는 자유 (`ok`, `data`, `items` 등 도메인에 맞게)

---

## DB 접근

```ts
import { getDb } from '@/lib/db';

const db = getDb();  // 싱글턴, 재생성 불필요

// 조회
const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined;
const rows = db.prepare('SELECT * FROM posts WHERE status = ?').all(status) as PostRow[];

// 쓰기
const result = db.prepare('INSERT INTO posts (...) VALUES (...)').run(...);

// 트랜잭션 (여러 write)
const doInsert = db.transaction(() => {
  db.prepare('INSERT INTO posts ...').run(...);
  db.prepare('INSERT INTO dev_tasks ...').run(...);
});
doInsert();
```

- `getDb()`: WAL 모드 적용된 better-sqlite3 싱글턴
- 동기 API — async/await 불필요, Promise 금지
- 반환값은 명시적으로 캐스팅 (`as PostRow | undefined`, `as PostRow[]`)
- DB_PATH: `process.env.DB_PATH || './data/board.db'`

---

## SSE 브로드캐스트

상태 변경(생성/수정/삭제) 후 반드시 호출:

```ts
import { broadcastEvent } from '@/lib/sse';

// 예시: 태스크 상태 변경
broadcastEvent({ type: 'task_updated', data: { id, status: 'done' } });

// 예시: 새 포스트
broadcastEvent({ type: 'new_post', data: { id: post.id, title: post.title } });
```

- 모든 연결된 클라이언트에 실시간 전파
- `type`은 클라이언트 `EventContext`에서 구독하는 이벤트명과 일치시킬 것

---

## 중복 방지 패턴

```ts
// INSERT OR IGNORE — UNIQUE 제약 위반 시 무시
db.prepare('INSERT OR IGNORE INTO reactions (id, target_id, author, emoji) VALUES (?, ?, ?, ?)')
  .run(nanoid(), target_id, author, emoji);

// source 기반 중복 검사 (예: 태스크 5개 제한)
const existing = db.prepare(
  'SELECT id FROM dev_tasks WHERE source = ? AND status NOT IN (?, ?)'
).all(source, 'done', 'cancelled');
if (existing.length >= 5) {
  return NextResponse.json({ error: '중복 태스크 한도 초과' }, { status: 409 });
}
```

---

## 클라이언트 측 res.ok 체크

클라이언트 컴포넌트에서 fetch 시 반드시 `apiFetch<T>` 사용 권장:

```ts
import { apiFetch } from '@/lib/api-fetch';

const result = await apiFetch<MyData>('/api/something', { method: 'POST', body: JSON.stringify(payload) });
if (!result.ok) {
  setError(result.message);  // result.status, result.message 사용 가능
  return;
}
console.log(result.data);  // MyData 타입 보장
```

직접 fetch 쓸 경우:

```ts
const res = await fetch('/api/something', { method: 'POST', ... });
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error ?? `HTTP ${res.status}`);
}
const data = await res.json();  // ok 체크 후에만 .json() 호출
```

`res.ok` 없이 바로 `res.json()` 하면 에러 응답을 정상 데이터로 처리하는 버그가 생긴다.
