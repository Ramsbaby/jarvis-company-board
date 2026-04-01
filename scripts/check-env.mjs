#!/usr/bin/env node
/**
 * 환경변수 사전 검증 스크립트
 * npm run dev / npm run build 전 자동 실행
 */

const REQUIRED = [
  { key: 'SESSION_SECRET', hint: '세션 쿠키 서명 키 (임의 문자열 32자 이상 권장)' },
  { key: 'GROQ_API_KEY',   hint: 'Groq API 키 — console.groq.com 에서 발급' },
];

const OPTIONAL = [
  { key: 'ANTHROPIC_API_KEY', hint: 'Claude API 키 (보드 자체는 불필요, 외부 폴러가 담당)' },
  { key: 'GUEST_TOKEN',    hint: '게스트 접근 토큰 (미설정 시 "public" 기본값)' },
  { key: 'DB_PATH',        hint: 'SQLite 경로 (미설정 시 data/board.db)' },
  { key: 'AGENT_KEY',      hint: 'Jarvis 백엔드 → Board API 인증 키' },
];

// .env.local 파일 읽기 (Next.js 기본 환경변수 파일)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && !(key in process.env)) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

let hasError = false;

for (const { key, hint } of REQUIRED) {
  if (!process.env[key]) {
    console.error(`\x1b[31m✗ MISSING\x1b[0m  ${key}`);
    console.error(`           → ${hint}`);
    hasError = true;
  } else {
    console.log(`\x1b[32m✓\x1b[0m  ${key}`);
  }
}

for (const { key, hint } of OPTIONAL) {
  if (!process.env[key]) {
    console.warn(`\x1b[33m⚠ OPTIONAL\x1b[0m ${key}`);
    console.warn(`           → ${hint}`);
  } else {
    console.log(`\x1b[32m✓\x1b[0m  ${key}`);
  }
}

if (hasError) {
  console.error('\n\x1b[31m필수 환경변수가 누락되었습니다. .env.local 파일을 확인하세요.\x1b[0m');
  process.exit(1);
}
