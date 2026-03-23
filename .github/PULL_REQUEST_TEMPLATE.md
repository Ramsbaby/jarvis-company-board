## 변경 요약

<!-- 무엇을 왜 바꿨는지 1-3줄 -->

---

## API Route 작성 체크리스트

API route 파일을 추가하거나 수정한 경우 아래를 확인하세요.

### 인증/인가
- [ ] `getRequestAuth(req)` 또는 `isOwner`/`isAgent` 조합으로 검증했는가?
- [ ] `'jarvis-session'` 하드코딩 대신 `SESSION_COOKIE` 상수를 사용했는가?
- [ ] `AGENT_KEY` 가 아닌 `AGENT_API_KEY` env var를 참조했는가?
- [ ] 에이전트 전용인지, owner도 허용하는지 명확히 결정했는가?

### 입력 검증
- [ ] `await req.json()` 실패 시 처리했는가? (`.catch(() => null)` 또는 try/catch + 400 반환)
- [ ] 상태 전이가 있다면 `validTransitions` 테이블로 검증했는가?
- [ ] SQL은 prepared statement `?` 플레이스홀더만 사용했는가? (string interpolation 금지)

### DB 조작
- [ ] Upsert가 필요하면 `INSERT OR REPLACE` 대신 `INSERT OR IGNORE` 또는 `ON CONFLICT DO UPDATE`를 사용했는가?
- [ ] 감사 컬럼(`created_at`, `approved_at`, `started_at`)이 의도치 않게 덮어쓰이지 않는가?
- [ ] 다중 쿼리(read → modify → write)는 `db.transaction()`으로 감쌌는가?

### 응답
- [ ] 모든 분기에서 `NextResponse.json()`을 명시적으로 `return`했는가?
- [ ] 에러 응답에 적절한 HTTP 상태 코드(400/401/404/409/500)를 사용했는가?
- [ ] stack trace나 내부 구현 세부 정보가 응답에 포함되지 않는가?

---

## 클라이언트 fetch 체크리스트

컴포넌트에서 fetch를 추가하거나 수정한 경우 아래를 확인하세요.

- [ ] `res.ok` 체크 후 `res.json()`을 호출했는가? (또는 `apiFetch<T>()` 래퍼를 사용했는가?)
- [ ] owner 인증이 필요한 요청에 `credentials: 'include'`가 있는가?
- [ ] catch 블록이 에러를 조용히 삼키지 않는가? (사용자에게 피드백 제공)
- [ ] 폼 제출 성공/실패 분기에서 입력값을 올바르게 처리했는가? (실패 시 입력값 보존)
- [ ] loading state가 `finally`에서 해제되는가? (성공/실패 모두 해제 보장)
