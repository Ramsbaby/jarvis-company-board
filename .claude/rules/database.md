---
paths:
  - "lib/db/**"
  - "lib/**/*.ts"
  - "**/*.sql"
---

# Database 규칙

## DB 경로 및 초기화

```ts
import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'board.db');

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode=WAL');  // WAL 모드 필수 (동시 읽기 성능)
```

- WAL 모드 없으면 읽기/쓰기 충돌로 SQLITE_BUSY 오류 발생
- `getDb()` 싱글턴 함수 사용 — 직접 `new Database()` 호출 금지 (lib/db.ts 외부에서)
- 디렉토리는 `mkdirSync(..., { recursive: true })`로 자동 생성

---

## N+1 쿼리 방지

자식 집계는 애플리케이션 루프가 아니라 SQL로 한 번에:

```ts
// 금지: N+1 — 태스크마다 자식 수 별도 조회
const tasks = db.prepare('SELECT * FROM dev_tasks').all() as DevTask[];
for (const task of tasks) {
  task.childCount = db.prepare('SELECT COUNT(*) FROM dev_tasks WHERE parent_id = ?').get(task.id);
}

// 권장: childAggMap 패턴 — 자식 집계를 단일 쿼리로
const childAggRows = db.prepare(`
  SELECT parent_id,
    COUNT(*) AS total_children,
    SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completed_children
  FROM dev_tasks WHERE parent_id IS NOT NULL
  GROUP BY parent_id
`).all() as Array<{ parent_id: string; total_children: number; completed_children: number }>;

const childAggMap = new Map(childAggRows.map(r => [r.parent_id, r]));

// 메모리에서 병합
const result = tasks.map(task => ({
  ...task,
  total_children: childAggMap.get(task.id)?.total_children ?? 0,
  completed_children: childAggMap.get(task.id)?.completed_children ?? 0,
}));
```

---

## 트랜잭션

여러 테이블에 동시에 쓰는 경우 반드시 트랜잭션:

```ts
const db = getDb();

const insertTaskWithPost = db.transaction((taskData: TaskData) => {
  const postId = nanoid();
  db.prepare('INSERT INTO posts (id, title, ...) VALUES (?, ?, ...)').run(postId, taskData.title, ...);
  db.prepare('INSERT INTO dev_tasks (id, post_id, ...) VALUES (?, ?, ...)').run(nanoid(), postId, ...);
  return postId;
});

const newPostId = insertTaskWithPost(data);
```

- `db.transaction()` 반환값은 함수 — 호출해야 실행됨
- 내부에서 throw 하면 자동 롤백
- 단일 write는 트랜잭션 불필요

---

## 스키마 마이그레이션

컬럼 추가는 idempotent try/catch 패턴:

```ts
// 기존 방식 (lib/db.ts에서 사용 중인 패턴)
try {
  db.exec('ALTER TABLE dev_tasks ADD COLUMN review TEXT');
} catch { /* already exists */ }
```

새 테이블 추가:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS my_table (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_my_table_created ON my_table(created_at DESC);
`);
```

- `CREATE TABLE IF NOT EXISTS` — 항상 idempotent하게
- 새 컬럼은 `ALTER TABLE ... ADD COLUMN` + try/catch
- 롤백이 필요한 구조 변경(컬럼 삭제, 타입 변경)은 별도 migration 파일로 관리

---

## 타입 캐스팅

better-sqlite3 반환값은 TypeScript가 모름 → 명시적 캐스팅 필수:

```ts
import type { Post, DevTask, Comment } from '@/lib/types';

// 단일 행 (없을 수 있음)
const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;
if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

// 복수 행
const tasks = db.prepare('SELECT * FROM dev_tasks WHERE status = ?').all(status) as DevTask[];

// 집계 결과
interface CountRow { count: number }
const row = db.prepare('SELECT COUNT(*) as count FROM posts').get() as CountRow;
console.log(row.count);
```

- `as Type | undefined` — `.get()`은 없으면 `undefined` 반환
- `as Type[]` — `.all()`은 항상 배열 반환 (빈 배열 가능)
- `.run()`은 `{ changes, lastInsertRowid }` 반환

---

## 인덱스 필수 컬럼

아래 컬럼은 조회 빈도가 높으므로 인덱스 필수:

```sql
-- 현재 적용된 인덱스 (lib/db.ts 기준)
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status);
CREATE INDEX IF NOT EXISTS idx_dev_tasks_parent ON dev_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_dev_tasks_group ON dev_tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_peer_votes_post ON peer_votes(post_id);
```

새 테이블 설계 시 인덱스 필요 컬럼:
- `status` — WHERE 필터로 빈번하게 사용
- `source` — 중복 검사
- `parent_id` — 계층 조회
- `group_id` — 그룹 집계
- `created_at DESC` — 정렬/페이지네이션
