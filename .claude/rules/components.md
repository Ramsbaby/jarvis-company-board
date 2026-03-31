---
paths:
  - "app/**/*.tsx"
  - "components/**/*.tsx"
  - "app/**/*.ts"
---

# Components 규칙

## 'use client' 규칙

```ts
// useState, useEffect, useEvent 등 훅을 쓰면 반드시 첫 줄에 선언
'use client';
import { useState, useEffect } from 'react';
```

- 서버 컴포넌트가 기본값 — 훅 없으면 선언하지 말 것
- `'use client'`는 파일 최상단, import보다 위
- 서버 컴포넌트에서 클라이언트 컴포넌트를 import하는 건 OK. 반대는 안 됨

---

## SSE 구독 패턴

전역 `EventContext`를 통해 구독 (직접 EventSource 열지 말 것):

```tsx
'use client';
import { useEvent } from '@/contexts/EventContext';
import { useEffect } from 'react';

export function MyComponent() {
  const { subscribe } = useEvent();

  useEffect(() => {
    const unsub = subscribe((ev) => {
      if (ev.type === 'task_updated') {
        // 상태 업데이트
      }
    });
    return unsub;  // cleanup: 구독 해제
  }, [subscribe]);
}
```

컴포넌트 레벨에서 EventSource를 직접 열어야 하는 경우:

```tsx
useEffect(() => {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => { /* ... */ };
  es.onerror = () => es.close();
  return () => es.close();  // cleanup 필수
}, []);
```

- cleanup 없이 `new EventSource()` 열면 컴포넌트 언마운트 후에도 연결이 남는다

---

## 로딩 / 에러 상태

모든 비동기 작업에 loading + error 처리 필수:

```tsx
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

async function handleSubmit() {
  setLoading(true);
  setError(null);
  try {
    const result = await apiFetch<MyData>('/api/something', { method: 'POST' });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    // 성공 처리
  } finally {
    setLoading(false);
  }
}

// JSX
{error && <p className="text-red-500 text-sm">{error}</p>}
<button disabled={loading}>
  {loading ? '처리 중...' : '제출'}
</button>
```

---

## 타입 안전성

```ts
// 금지
const data: any = await res.json();
function process(item: any) { ... }

// 권장: 공유 타입은 @/lib/types에서 import
import type { DevTask, Post, Comment } from '@/lib/types';

// 불가피하게 unknown 필요 시
const raw = await res.json() as unknown;
const task = raw as DevTask;
```

- `any` 사용 시 컴파일 에러는 막히지만 런타임 버그로 돌아온다
- DB row 반환값은 항상 명시적 캐스팅: `.get(...) as PostRow | undefined`
- `@/lib/types`에 없는 타입은 해당 파일에 추가하고 import

---

## 스타일

```tsx
// 권장: Tailwind CSS v4 유틸리티
<div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2">

// 금지: 인라인 스타일 (동적 색상 계산 등 불가피한 경우만 예외)
<div style={{ display: 'flex', gap: '8px' }}>  // 지양

// 동적 클래스는 템플릿 리터럴 또는 조건부 표현식
<div className={`text-sm ${isActive ? 'text-indigo-600' : 'text-zinc-400'}`}>
```

- Tailwind v4 — `@apply` 없이 유틸리티 클래스 직접 조합
- 디자인 토큰(색상, 간격)은 `tailwind.config.ts` 참고

---

## 이미지 / 자산

```tsx
// 권장: Next.js Image 컴포넌트
import Image from 'next/image';

<Image src="/logo.png" alt="Jarvis" width={32} height={32} />

// 금지: <img> 태그 직접 사용 (최적화 누락, LCP 악화)
<img src="/logo.png" alt="Jarvis" />
```

- 외부 도메인 이미지는 `next.config.ts`의 `images.remotePatterns`에 등록 필요
