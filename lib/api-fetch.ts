/**
 * 타입-세이프 fetch 래퍼.
 * res.ok 체크를 구조적으로 강제한다 — 성공/실패 분기를 타입으로 표현하므로
 * 에러 응답을 정상 데이터로 처리하는 실수를 컴파일 단계에서 차단한다.
 *
 * 사용법:
 *   const result = await apiFetch<MyData>('/api/something', { method: 'POST', body: ... });
 *   if (!result.ok) { setError(result.message); return; }
 *   console.log(result.data); // 여기서 data는 MyData 타입이 보장됨
 */

export type ApiOk<T> = { ok: true; data: T; status: number };
export type ApiErr   = { ok: false; status: number; message: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export async function apiFetch<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, { credentials: 'include', ...init });
  } catch {
    return { ok: false, status: 0, message: '네트워크 오류. 연결을 확인해주세요.' };
  }

  if (!res.ok) {
    let message = `오류 (${res.status})`;
    try {
      const body = await res.json();
      message = body?.error ?? body?.message ?? message;
    } catch { /* JSON 파싱 실패 시 기본 메시지 사용 */ }
    return { ok: false, status: res.status, message };
  }

  let data: T;
  try {
    data = await res.json() as T;
  } catch {
    return { ok: false, status: res.status, message: '응답 파싱 실패' };
  }

  return { ok: true, data, status: res.status };
}
