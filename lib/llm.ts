/**
 * LLM helper — Groq API (OpenAI-compatible)
 * Provider: groq.com (free tier, fast inference)
 * Switch provider by changing GROQ_BASE_URL + GROQ_MODEL env vars if needed.
 */

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Light model: fast, for simple tasks (tags, impact summary, consensus) */
export const MODEL_FAST = 'llama-3.1-8b-instant';
/** Quality model: for agent personas requiring deep reasoning */
export const MODEL_QUALITY = 'llama-3.3-70b-versatile';

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly isTimeout = false,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/** 재시도 불필요한 에러 (인증·입력 오류) */
function isNonRetryable(err: LLMError): boolean {
  return err.status !== undefined && err.status >= 400 && err.status < 500;
}

/** 지수 백오프 대기 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function callLLM(
  prompt: string,
  options: {
    model?: string;
    maxTokens?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
    systemPrompt?: string;
    /** Groq temperature (0–2). 반론형 0.8, 합성형 0.3, 표준 0.65 */
    temperature?: number;
    /** 실패 시 재시도 횟수 (기본 2회, 타임아웃/네트워크 오류에만 적용) */
    retries?: number;
  } = {},
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new LLMError('GROQ_API_KEY가 설정되지 않았습니다', 500);

  const {
    model = MODEL_FAST,
    maxTokens = 1200,
    timeoutMs = 20000,
    systemPrompt,
    temperature,
    retries = 2,
  } = options;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  let lastErr: LLMError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // 재시도 전 지수 백오프 (첫 시도는 대기 없음)
    if (attempt > 0) {
      await sleep(500 * Math.pow(2, attempt - 1)); // 500ms, 1000ms
    }

    // Use provided signal or create our own timeout
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let signal = options.signal;

    if (!signal) {
      controller = new AbortController();
      timer = setTimeout(() => controller!.abort(), timeoutMs);
      signal = controller.signal;
    }

    try {
      const res = await fetch(GROQ_BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          ...(temperature !== undefined && { temperature }),
          messages,
        }),
        signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new LLMError(`Groq API 오류 (${res.status}): ${body.slice(0, 200)}`, res.status);
        // 4xx 에러는 재시도 무의미
        if (isNonRetryable(err)) throw err;
        lastErr = err;
        continue;
      }

      const data = await res.json() as { choices: Array<{ message: { content: string } }> };
      const text: string = data?.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) throw new LLMError('빈 응답');
      return text;
    } catch (err: unknown) {
      if (err instanceof LLMError) {
        if (isNonRetryable(err)) throw err; // 4xx는 즉시 throw
        lastErr = err;
        continue;
      }
      if ((err as Error).name === 'AbortError' || (err as Error).message?.includes('aborted')) {
        lastErr = new LLMError('LLM 응답 시간 초과', 504, true);
        continue;
      }
      lastErr = new LLMError((err as Error).message ?? 'LLM 호출 실패');
      continue;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw lastErr ?? new LLMError('LLM 호출 실패 (재시도 소진)');
}
